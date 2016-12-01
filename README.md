# api-blueprint-server

Super lightweight API blueprint (https://apiblueprint.org) mock server and proxy for Express.

To see the demo with my API blueprint:
```bash
    git clone git@github.com:jonboydell/api-blueprint-server.git
    cd api-blueprint-server
    npm install
    node bin/www
```

I use nodemon to keep node.js running
```bash
    npm -g install nodemon
```
Run node using the following instruction
```
    nodemon bin/www --ignore astfile.json
```
That "ignore" command is important if you're running in debug mode as the server will output the AST file of the loaded APIB file which, if you don't ignore it, will restart node ad infinitum.

To the api-blueprint-server for yourself:
```javascript
    In your app.js or server.js

    ...
    var proxy = require('./routes/ROUTES_THAT_YOU_WANT_TO_PROXY');
    var apibmiddleware = require('./routes/apib-router-middleware');
    app.use(apibmiddleware('./PATH_TO_YOUR_APIB_FILE', proxy));
    app.use('/', index);
    ...
```

How does it work?
---
Requests are matched against those defined in the APIB file loaded into the mock server.  The request (if matched, 404 otherwise) is then validated against the 'schema' specified with the request in the APIB.  A response is then selected (based on the request and the 'expectedStatus' request header) and played back to the client making the request.

Once proxies are working you can specify a router 'proxy' that will be executed rather than simply playing back a selected response.  You could use the proxy to actually implement your backend code whilst still having access to the validation provided by the mock server.

What doesn't work?
---
Proxying requests to a matching endpoint if it exists.
