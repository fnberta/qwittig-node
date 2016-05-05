const path = require('path');
const ParseServer = require('parse-server').ParseServer;
const iosDevCert = path.resolve(__dirname, '../../../cert/ParsePushDevelopmentCertificate.p12');
const iosProdCert = path.resolve(__dirname, '../../../cert/ParsePushProductionCertificate.p12');
const cloudCode = path.resolve(__dirname, './cloudcode/main.js');

const appId = 'yLuL6xJB2dUD2hjfh4W2EcZizcPsJZKDgDzbrPji';
const masterKey = 'TUH97H9EqaRc8O4UGSdwWuY5kiDI9lcxl3n4TQoK';

const parseApi = new ParseServer({
    databaseURI: 'mongodb://parse:phusPAJ4drufuka4haye@localhost:27017/qwittig',
    cloud: cloudCode,
    appId: appId,
    masterKey: masterKey,
    serverURL: 'http://localhost:3000/api/data',
    push: {
        android: {
            senderId: '982871908066',
            apiKey: 'AIzaSyAWyVYqTSrEZavQBYa298ru835D_cswig8'
        },
        ios: [
            {
                pfx: iosDevCert,
                bundleId: 'ch.giantific.qwittig',
                production: false
            },
            {
                pfx: iosProdCert,
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
