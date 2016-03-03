var ParseServer = require('parse-server').ParseServer;
var parseApi = new ParseServer({
    databaseURI: 'mongodb://parse:12345678@localhost:27017/qwittig?authSource=admin',
    cloud: __dirname + '/cloudcode/main.js',
    appId: 'yLuL6xJB2dUD2hjfh4W2EcZizcPsJZKDgDzbrPji',
    masterKey: 'TUH97H9EqaRc8O4UGSdwWuY5kiDI9lcxl3n4TQoK',
    serverURL: 'http://localhost:3000/api/data',
    push: {
        android: {
            senderId: '982871908066',
            apiKey: 'AIzaSyAWyVYqTSrEZavQBYa298ru835D_cswig8'
        },
        ios: [
            {
                pfx: __dirname + '/ParseDevelopmentPushCertificate.p12',
                bundleId: 'ch.giantific.qwittig',
                production: false
            },
            {
                pfx: __dirname + '/ParseProductionPushCertificate.p12',
                bundleId: 'ch.giantific.qwittig',
                production: true
            }
        ]
    }
});

module.exports = parseApi;
