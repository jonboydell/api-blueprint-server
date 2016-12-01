var express = require('express');
var router = express.Router();
var drafter = require('drafter');
var fs = require('fs');

const METHOD_GET = 'GET';
const METHOD_POST = 'POST';
const HEADER_ACCEPT = 'Accept';
const HEADER_PREFER = 'Prefer';
const HEADER_CONTENT_TYPE = 'Content-Type';
const STATUS_OK = 200;
const STATUS_CLIENT_ERROR = 400;
const STATUS_NOT_ACCEPTABLE = 406;

var proxy = function(name, req, res, next) {
    if (name == '/') {
        res.render('index');
    }
    return false;
};

var createBpStatus = function(message, expectedContentType, clientAcceptHeader, clientContentType) {
    var bp_status = {
        bp_message : message,
        bp_server : {
            bp_expectedContentType : expectedContentType
        },
        bp_client :  {
            bp_acceptedContentType : clientAcceptHeader,
            bp_requestContentType  : clientContentType
        }
    };
    return bp_status;
}

var buildResponse = function(r, response) {
    response.status = r.name;
    r.headers.forEach(function(h) {
        response.headers.push(h);
    });
    response.content = r.content;
}

var thingy = function(ep, req, res, next) {

    console.log(req.body);
    console.log(ep.requests[0].schema);

    var Validator = require('jsonschema').Validator;
    var v = new Validator();
    var valid = v.validate(req.body, JSON.parse(ep.requests[0].schema))

    var clientError = false;

    if (valid.errors.length > 0) {
        res.status(STATUS_CLIENT_ERROR).send(valid.errors[0]);
        clientError = true;
    }

    var expectedContentType = ep.requests[0].contentType;
    var clientAcceptHeader = req.get(HEADER_ACCEPT);
    var clientContentType = req.get(HEADER_CONTENT_TYPE);

    if (!clientError) {
        if (!req.accepts(expectedContentType)) {
            var bp_status = createBpStatus('Accepted content type must match expected content type', expectedContentType, clientAcceptHeader, clientContentType);
            res.status(STATUS_NOT_ACCEPTABLE).send(bp_status);
        } else {
            var response = {
                headers: []
            };

            var matchedPrefer = false;

            if (req.get(HEADER_PREFER)) {
                ep.responses.forEach(function(r) {
                    if (req.get(HEADER_PREFER) == r.name) {
                        buildResponse(r, response);
                        matchedPrefer = true;
                    }
                });
            }

            if (!matchedPrefer) {
                var r = ep.responses[0];
                buildResponse(r, response);
            }

            //data.bp_status = createBpStatus('OK', expectedContentType, clientAcceptHeader, clientContentType);
            response.headers.forEach(function (h) {
                res.set(h.name, h.value);
            });
            res.status(response.status).send(response.content);
        }
    }
}

var createExpressEndpoints = function(endpoints) {

    endpoints.forEach(function(ep) {
        if (METHOD_GET == ep.method) {
            router.get(ep.name, function(req, res, next) {
                thingy(ep, req, res, next);
            });
        }

        if (METHOD_POST == ep.method) {
            router.post(ep.name, function(req, res, next) {
                thingy(ep, req, res, next);
            });
        }
    });
}

function loadAndParse(apiDefinitionFile, fn) {

    var endpoints = [];

    fs.readFile( __dirname + apiDefinitionFile, function (err, data) {
        if (err) {
            throw err;
        }

        drafter.parse(data.toString(), { type: 'ast' }, function(err, result) {
            var resourcesArray = result.ast.resourceGroups[0].resources;

            function getContentTypeFromRequest(request) {
                var ct = request.headers[0].value;
                return ct;
            }

            function collateRequestsFromExample(requests) {
                var result = [];
                requests.forEach(function(request) {
                    var r = {};
                    r.schema = request.schema;
                    r.contentType = getContentTypeFromRequest(request);
                    result.push(r);
                });
                return result;
            }

            function collateResponsesFromExample(responses) {
                var result = [];
                responses.forEach(function(response) {
                    var r = {};
                    r.name = response.name;
                    r.content = response.content[0].content;
                    r.headers = [];
                    response.headers.forEach(function(header) {
                        r.headers.push(header);
                    });
                    result.push(r);
                });
                return result;
            }

            var buildEndpointsFromActions = function(name, actions) {
                var result = [];
                actions.forEach(function(action) {
                    var ep = {};
                    ep.name = name;
                    ep.method = action.method;
                    action.examples.forEach(function(example) {
                        ep.requests = collateRequestsFromExample(example.requests);
                        ep.responses = collateResponsesFromExample(example.responses);
                    });
                    result.push(ep);
                });
                return result;
            };

            resourcesArray.forEach(function(resource) {
                //fs.writeFile('out.txt', JSON.stringify(resource));
                var ep = buildEndpointsFromActions(resource.uriTemplate, resource.actions);
                ep.forEach(function(e) {
                    endpoints.push(e);
                });
            });

            fn(endpoints);
        });
    });
};

loadAndParse('/../../apiary.apib', createExpressEndpoints);

module.exports = router;
