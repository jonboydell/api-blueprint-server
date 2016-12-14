var fs = require('fs');
var drafter = require('drafter');
var Validator = require('jsonschema').Validator;
var express = require('express');
var router = express.Router();
var proxyrouter;

const winston = require('winston');

const DEBUG = false;
const DRAFTER_PARSE_TYPE = 'ast';
const DRAFTER_DEBUG_FILE = '/../astfile.json';
const METHOD_GET = 'GET';
const METHOD_POST = 'POST';
const HEADER_ACCEPT = 'Accept';
const HEADER_CONTENT_TYPE = 'Content-Type';
const HEADER_X_EXPECTED_STATUS = 'x-expected-status';
const CONTENT_TYPE_JSON = "application/json";
const STATUS_OK = 200;
const STATUS_CLIENT_ERROR = 400;
const STATUS_NOT_ACCEPTABLE = 406;

var __drafter_parse_type = DRAFTER_PARSE_TYPE;

var __debug = DEBUG;
var __debug_file = DRAFTER_DEBUG_FILE;

function routermiddleware(apibfile, proxyrouter) {
    this.proxyrouter = proxyrouter;

    winston.log('info', 'starting api blueprint server', {'blueprint':apibfile});

    var files = require('../loadfilepromise.js');
    files.readFile(__dirname + apibfile).then(function(data) {
        readApib(data);
    });

    return router;
}

var readApib = function(data) {
    drafter.parse(data.toString(), { type: DRAFTER_PARSE_TYPE }, parseApib);
}

var parseApib = function(err, result) {
    if (err) { throw err; }
    if (__debug) { fs.writeFile( __dirname + __debug_file, JSON.stringify(result)); }

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
                            if (HEADER_CONTENT_TYPE == h.name) {
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
                            if (HEADER_CONTENT_TYPE == h.name) {
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
        if (METHOD_GET == ep.method) {
            router.get(ep.uri, function(req, res, next) {
                validateRequest(req, res, next, ep);
            });
            router.get(ep.uri, function(req, res, next) {
                respondOrProxy(req, res, next, ep);
            });
        }
        if (METHOD_POST == ep.method) {
            router.post(ep.uri, function(req, res, next) {
                validateRequest(req, res, next, ep);
            });
            router.post(ep.uri, function(req, res, next) {
                respondOrProxy(req, res, next, ep);
            });
        }
    });

    winston.log('info', 'i have mapped', {'endpoints':eps.length});
    router.use(this.proxyrouter);
}

var selectRequest = function(req, ep) {
    return ep.requests[0];
}

var invalidRequestContentType = function(req, res, request) {
    var error = req.get(HEADER_CONTENT_TYPE) != request.contentType;
    if (error) {
        var body = {};
        body.mesage = 'Sent content-type header does not match request content type';
        body.expectedContentType = request.contentType;
        res.status(STATUS_CLIENT_ERROR).set({HEADER_CONTENT_TYPE:CONTENT_TYPE_JSON}).send(body);
    }
    return error;
}

var invalidResponseContentType = function(req, res, request, response) {
    var error = !req.accepts(response.contentType);
    if (error) {
        var body = {};
        body.mesage = 'Sent accept header does not match any response content type';
        body.expectedContentType = request.contentType;
        res.status(STATUS_CLIENT_ERROR).set({HEADER_CONTENT_TYPE:CONTENT_TYPE_JSON}).send(body);
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
        res.status(STATUS_CLIENT_ERROR).set({HEADER_CONTENT_TYPE:CONTENT_TYPE_JSON}).send(body);
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
    if(req.get(HEADER_X_EXPECTED_STATUS)) {
        ep.responses.forEach(function(r) {
            if(req.get(HEADER_X_EXPECTED_STATUS) == r.status) {
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
