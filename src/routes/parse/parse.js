const path = require('path');
const ParseServer = require('parse-server').ParseServer;
const iosDevCert = path.resolve(__dirname, '../../../cert/ParsePushDevelopmentCertificate.p12');
const iosProdCert = path.resolve(__dirname, '../../../cert/ParsePushProductionCertificate.p12');
const cloudCode = path.resolve(__dirname, './cloudcode/main.js');

export const APP_ID = 'yLuL6xJB2dUD2hjfh4W2EcZizcPsJZKDgDzbrPji';
export const MASTER_KEY = 'TUH97H9EqaRc8O4UGSdwWuY5kiDI9lcxl3n4TQoK';

export const parseApi = new ParseServer({
    databaseURI: 'mongodb://parse:phusPAJ4drufuka4haye@localhost:27017/qwittig',
    cloud: cloudCode,
    appId: APP_ID,
    masterKey: MASTER_KEY,
    serverURL: 'http://localhost:3000/api/data',
    push: {
        android: {
            senderId: '1027430235430',
            apiKey: 'AIzaSyBVubQGgKNPxpvMz_bR6bRtDjf1ka5bwYo'
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
