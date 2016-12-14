var fs = require('fs');

var readFile = function(filename) {
    return new Promise(function(resolve, reject) {
        fs.readFile(filename, function(err, data) {
            if(err) {
                reject(err);
            } else {
                resolve(data.toString());
            }
        });
    });
}

module.exports.readFile = readFile;
