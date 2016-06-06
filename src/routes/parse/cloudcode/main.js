/**
 * Created by fabio on 02.03.16.
 */

import Identity from './entities/Identity';
import {beforeSave as identityBeforeSave, beforeDelete as identityBeforeDelete} from './hooks/identityHooks';
import Group from './entities/Group';
import {beforeSave as groupBeforeSave, beforeDelete as groupBeforeDelete} from './hooks/groupHooks';
import Purchase from './entities/Purchase';
import {
    beforeSave as purchaseBeforeSave,
    afterSave as purchaseAfterSave,
    beforeDelete as purchaseBeforeDelete,
    afterDelete as purchaseAfterDelete
} from './hooks/purchaseHooks';
import Item from './entities/Item';
import Compensation from './entities/Compensation';
import {beforeSave as compBeforeSave, afterSave as compAfterSave} from './hooks/compensationHooks';
import Task from './entities/Task';
import TaskHistoryEvent from './entities/TaskHistoryEvent';
import {
    afterSave as taskAfterSave,
    beforeDelete as taskBeforeDelete,
    afterDelete as taskAfterDelete,
    afterSaveHistory as taskHistoryAfterSave
} from './hooks/taskHooks';
import {
    afterSave as userAfterSave,
    beforeDelete as userBeforeDelete,
    afterDelete as userAfterDelete
} from './hooks/userHooks';
import {statsSpending, statsStores, statsCurrencies} from './functions/statsFunctions'
import {remindComp, remindTask} from './functions/remindFunctions'
import {
    calculateBalancesForGroup,
    calculateCompensationsForGroup,
    addIdentityToUser,
    addGroup,
    loginWithGoogle,
    setPassword,
    cleanUpIdentities
} from './functions/userFunctions';
import {deleteParseFile} from './utils';

Parse.Object.registerSubclass('Identity', Identity);
Parse.Object.registerSubclass('Group', Group);
Parse.Object.registerSubclass('Purchase', Purchase);
Parse.Object.registerSubclass('Item', Item);
Parse.Object.registerSubclass('Compensation', Compensation);
Parse.Object.registerSubclass('Task', Task);
Parse.Object.registerSubclass('TaskHistoryEvent', TaskHistoryEvent);


Parse.Cloud.afterSave(Parse.User, userAfterSave);
Parse.Cloud.beforeDelete(Parse.User, userBeforeDelete);
Parse.Cloud.afterDelete(Parse.User, userAfterDelete);

Parse.Cloud.beforeSave('Identity', identityBeforeSave);
Parse.Cloud.beforeDelete('Identity', identityBeforeDelete);

Parse.Cloud.beforeSave('Group', groupBeforeSave);
Parse.Cloud.beforeDelete('Group', groupBeforeDelete);

Parse.Cloud.beforeSave('Purchase', purchaseBeforeSave);
Parse.Cloud.afterSave('Purchase', purchaseAfterSave);
Parse.Cloud.beforeDelete('Purchase', purchaseBeforeDelete);
Parse.Cloud.afterDelete('Purchase', purchaseAfterDelete);

Parse.Cloud.beforeSave('Compensation', compBeforeSave);
Parse.Cloud.afterSave('Compensation', compAfterSave);

Parse.Cloud.afterSave('Task', taskAfterSave);
Parse.Cloud.beforeDelete('Task', taskBeforeDelete);
Parse.Cloud.afterDelete('Task', taskAfterDelete);
Parse.Cloud.afterSave('TaskHistoryEvent', taskHistoryAfterSave);


Parse.Cloud.define('pushCompensationRemind', remindComp);
Parse.Cloud.define('pushTaskRemind', remindTask);

Parse.Cloud.define('deleteParseFile', function (request, response) {
    const fileName = request.params.fileName;

    deleteParseFile(fileName)
        .then(() => response.success('File was deleted successfully.'))
        .catch(err => response.error('Failed to delete file with error: ' + err.message));
});

Parse.Cloud.define('calculateBalances', calculateBalancesForGroup);
Parse.Cloud.define('calculateCompensations', calculateCompensationsForGroup);
Parse.Cloud.define('addIdentityToUser', addIdentityToUser);
Parse.Cloud.define('addGroup', addGroup);
Parse.Cloud.define('loginWithGoogle', loginWithGoogle);
Parse.Cloud.define('setPassword', setPassword);
Parse.Cloud.define('cleanUpIdentities', cleanUpIdentities);

Parse.Cloud.define('statsSpending', statsSpending);
Parse.Cloud.define('statsStores', statsStores);
Parse.Cloud.define('statsCurrencies', statsCurrencies);