import test from 'ava';
import calculateCompensations from '../build/calculations/compensations';
import calculateBalances from '../build/calculations/balances';
import { TIMESTAMP } from '../build/firebase/main';

test('should calculate compensations', (t) => {
  const identitiesById = {
    identity1: {
      balance: {
        num: 20,
        den: 1,
      },
    },
    identity2: {
      balance: {
        num: -26,
        den: 1,
      },
    },
    identity3: {
      balance: {
        num: -4,
        den: 1,
      },
    },
    identity4: {
      balance: {
        num: 10,
        den: 1,
      },
    },
  };
  const groupId = 'group1';
  const result = [
    {
      createdAt: TIMESTAMP,
      group: groupId,
      debtor: 'identity2',
      creditor: 'identity1',
      paid: false,
      amount: {
        num: 20,
        den: 1,
      },
    },
    {
      createdAt: TIMESTAMP,
      group: groupId,
      debtor: 'identity2',
      creditor: 'identity4',
      paid: false,
      amount: {
        num: 6,
        den: 1,
      },
    },
    {
      createdAt: TIMESTAMP,
      group: groupId,
      debtor: 'identity3',
      creditor: 'identity4',
      paid: false,
      amount: {
        num: 4,
        den: 1,
      },
    },
  ];

  const comps = calculateCompensations(identitiesById, groupId);
  t.deepEqual(comps, result, 'compensations not correctly calculated');
});

test('should calculate balances', (t) => {
  const purchases = [];
  const compensations = [{
    debtor: 'identity1',
    creditor: 'identity2',
    amount: {
      num: 10,
      den: 1,
    },
  }];
  const identityIds = [];
  const result = [
    {
      identityId: 'identity1',
      balance: 1234,
    },
  ];

  const balances = calculateBalances(purchases, compensations, identityIds);
  t.deepEqual(balances, result, 'balances not correclty calculated');
});
