var ParseServer = require('parse-server').ParseServer;
var parseApi = new ParseServer({
    databaseURI: 'mongodb://parse:phusPAJ4drufuka4haye@localhost:27017/qwittig',
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
                pfx: __dirname + '/ParsePushDevelopmentCertificate.p12',
                bundleId: 'ch.giantific.qwittig',
                production: false
            },
            {
                pfx: __dirname + '/ParsePushProductionCertificate.p12',
                bundleId: 'ch.giantific.qwittig',
                production: true
            }
        ]
    },
    oauth: {
        facebook: {
            appIds: '483474338502548'
        }
    }

});

module.exports = parseApi;
