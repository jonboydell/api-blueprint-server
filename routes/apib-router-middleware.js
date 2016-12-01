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
                        ep.requests.push(r);
                    });
                    example.responses.forEach(function(response) {
                        var r = {};
                        r.status = response.name;
                        r.body = response.body;
                        r.headers = response.headers;
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
                respondOrProxy(res, res, next, ep);
            });
        }
    });

    router.use(this.proxyrouter);
}

var validateRequest = function(req, res, next, ep) {
    //next();
    res.status(400).set({'Content-Type':'application/json'}).send({'message':'sent request does not match expected request'});
}

var selectResponse = function(req, ep) {
    var response = {};
    response = ep.responses[0];
    return response;
}

var proxyResponse = function() {
    return false;
}

var respondOrProxy = function(req, res, next, ep) {
    var response = selectResponse(req, ep);
    if(proxyResponse()) next();
    res.status(response.status).set(response.headers).send(response.body);
}

module.exports = routermiddleware;
