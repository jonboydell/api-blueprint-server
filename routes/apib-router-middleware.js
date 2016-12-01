var fs = require('fs');
var drafter = require('drafter');
var Validator = require('jsonschema').Validator;
var debug = false;
var express = require('express');
var router = express.Router();
var proxyrouter;

function routermiddleware(apibfile, proxyrouter) {
    this.proxyrouter = proxyrouter;
    fs.readFile( __dirname + '/../' + apibfile, readApib);
    return router;
}

var readApib = function(err, data) {
    if(err) { throw err; }
    drafter.parse(data.toString(), { type: 'ast' }, parseApib);
}

var parseApib = function(err, result) {
    if (err) { throw err; }
    if (debug) { fs.writeFile( __dirname + '/../astfile.json', JSON.stringify(result)); }

    var eps = [];

    result.ast.resourceGroups.forEach(function(resourceGroup) {
        resourceGroup.resources.forEach(function(resource) {
            resource.actions.forEach(function(action) {
                action.examples.forEach(function(example) {
                    var ep = {};
                    ep.method = action.method;
                    ep.uri = resource.uriTemplate;
                    ep.requests = [];
                    ep.responses = [];
                    if (!example.requests || example.requests.length == 0) {
                        var err = new Error('0 requests');
                        throw err;
                    }
                    if (!example.responses || example.responses.length == 0) {
                        var err = new Error('0 responses');
                        throw err;
                    }
                    example.requests.forEach(function(request) {
                        var r = {};
                        r.headers = request.headers;
                        r.schema = request.schema;
                        request.headers.forEach(function(h) {
                            if ('Content-Type' == h.name) {
                                r.contentType = h.value;
                            }
                        });
                        ep.requests.push(r);
                    });
                    example.responses.forEach(function(response) {
                        var r = {};
                        r.status = response.name;
                        r.body = response.body;
                        r.headers = response.headers;
                        response.headers.forEach(function(h) {
                            if ('Content-Type' == h.name) {
                                r.contentType = h.value;
                            }
                        });
                        ep.responses.push(r);
                    });
                    eps.push(ep);
                });
            });
        });
    });

    eps.forEach(function(ep) {
        if ('GET' == ep.method) {
            router.get(ep.uri, function(req, res, next) {
                validateRequest(req, res, next, ep);

            });
            router.get(ep.uri, function(req, res, next) {
                respondOrProxy(req, res, next, ep);
            });
        }
        if ('POST' == ep.method) {
            router.post(ep.uri, function(req, res, next) {
                validateRequest(req, res, next, ep);
            });
            router.post(ep.uri, function(req, res, next) {
                respondOrProxy(req, res, next, ep);
            });
        }
    });

    router.use(this.proxyrouter);
}

var selectRequest = function(req, ep) {
    return ep.requests[0];
}

var invalidRequestContentType = function(req, res, request) {
    var error = req.get('content-type') != request.contentType;
    if (error) {
        var body = {};
        body.mesage = 'Sent content-type header does not match request content type';
        body.expectedContentType = request.contentType;
        res.status(400).set({'Content-Type':'application/json'}).send(body);
    }
    return error;
}

var invalidResponseContentType = function(req, res, request, response) {
    var error = !req.accepts(response.contentType);
    if (error) {
        var body = {};
        body.mesage = 'Sent accept header does not match any response content type';
        body.expectedContentType = request.contentType;
        res.status(400).set({'Content-Type':'application/json'}).send(body);
    }
    return error;
}

var invalidRequestSchema = function (req, res, request) {
    var error = false;
    var v = new Validator();
    var validationResponse = {};
    if (request.schema) {
        validationResponse = v.validate(req.body, JSON.parse(request.schema));
    }
    if(validationResponse.errors && validationResponse.errors.length > 0) {
        error = true;
        var body = {};
        body.mesage = 'Sent request does not match expected request schema';
        body.expectedSchema = JSON.parse(request.schema);
        res.status(400).set({'Content-Type':'application/json'}).send(body);
    }
    return error;
}

var validateRequest = function(req, res, next, ep) {

    var request = selectRequest(req, ep);
    var response = selectResponse(req, ep);

    if (invalidRequestContentType(req, res, request) ||
            invalidResponseContentType(req, res, request, response) ||
                invalidRequestSchema(req, res, request)) {

    } else {
        next();
    }
}


var selectResponse = function(req, ep) {
    var response = ep.responses[0];
    if(req.get('x-expected-status')) {
        ep.responses.forEach(function(r) {
            if(req.get('x-expected-status') == r.status) {
                response = r;
            }
        });
    }
    return response;
}

var proxyResponse = function() {
    return false;
}

var respondOrProxy = function(req, res, next, ep) {
    var response = selectResponse(req, ep);
    if(proxyResponse()) next();
    response.headers.forEach(function (h) {
        res.set(h.name, h.value);
    });
    res.status(response.status).send(response.body);
}

module.exports = routermiddleware;
