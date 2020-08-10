// @flow
import { BigNumber } from "bignumber.js";
import {
  AmountRequired,
  InvalidAddressBecauseDestinationIsAlsoSource,
  NotEnoughBalance,
  FeeNotLoaded,
} from "@ledgerhq/errors";
import { AlgorandASANotOptInInRecipient } from "../../../errors";
import { validateRecipient } from "../../../bridge/shared";
import type { AccountBridge, CurrencyBridge, Account } from "../../../types";
import type { Transaction } from "../types";
import { AlgorandOperationTypeEnum } from "../types";
import { scanAccounts } from "../../../libcore/scanAccounts";
import { sync } from "../../../libcore/syncAccount";
import type { CacheRes } from "../../../cache";
import { makeLRUCache } from "../../../cache";
import { getMainAccount } from "../../../account";
import broadcast from "../libcore-broadcast";
import signOperation from "../libcore-signOperation";
import { getFeesForTransaction } from "../../../libcore/getFeesForTransaction";
import { withLibcore } from "../../../libcore/access";
import { getCoreAccount } from "../../../libcore/getCoreAccount";
import { libcoreAmountToBigNumber } from "../../../libcore/buildBigNumber";
import { extractTokenId } from "../tokens";
import { getAbandonSeedAddress } from "../../../data/abandonseed";
import { ALGORAND_MAX_MEMO_SIZE } from "../logic";
import { makeAccountBridgeReceive } from "../../../bridge/jsHelpers";

const receive = makeAccountBridgeReceive();

export const calculateFees: CacheRes<
  Array<{ a: Account, t: Transaction }>,
  { estimatedFees: BigNumber, estimatedGas: ?BigNumber }
> = makeLRUCache(
  async ({
    a,
    t,
  }): Promise<{ estimatedFees: BigNumber, estimatedGas: ?BigNumber }> => {
    return await getFeesForTransaction({
      account: a,
      transaction: t,
    });
  },
  ({ a, t }) =>
    `${a.id}_${t.amount.toString()}_${t.recipient}_${String(t.useAllAmount)}_${
      t.memo ? t.memo.toString() : ""
    }_${t.mode}_${t.assetId || ""}`
);

const getSpendableMaxForOptIn = async (account) =>
  await withLibcore(async (core) => {
    const { coreAccount } = await getCoreAccount(core, account);

    const algorandAccount = await coreAccount.asAlgorandAccount();
    const spendableBalanceBigInt = await algorandAccount.getSpendableBalance(
      AlgorandOperationTypeEnum.ASSET_OPT_IN
    );
    const spendableBalance = await libcoreAmountToBigNumber(
      spendableBalanceBigInt
    );

    return spendableBalance;
  });

const createTransaction = () => ({
  family: "algorand",
  amount: BigNumber(0),
  fees: null,
  recipient: "",
  useAllAmount: false,
  memo: null,
  mode: "send",
  assetId: null,
});

const updateTransaction = (t, patch) => {
  return { ...t, ...patch };
};

const recipientHasAsset = async (assetId, recipient, account) =>
  await withLibcore(async (core) => {
    const { coreAccount } = await getCoreAccount(core, account);

    const algorandAccount = await coreAccount.asAlgorandAccount();
    const hasAsset = await algorandAccount.hasAsset(recipient, assetId);

    return hasAsset;
  });
/*
 * Here are the list of the differents things we check
 * - Check if recipient is the same in case of send
 * - Check if recipient is valid
 * - Check if amounts are set
 * - Check if fees are loaded
 * - Check if is a send Max and set the amount
 * - Check if Token is already optin at the recipient
 * - Check if memo is too long
 */
const getTransactionStatus = async (a: Account, t) => {
  const errors = {};
  const warnings = {};
  const tokenAccount = !t.subAccountId
    ? null
    : a.subAccounts && a.subAccounts.find((ta) => ta.id === t.subAccountId);

  if (t.mode === "send" && a.freshAddress === t.recipient) {
    errors.recipient = new InvalidAddressBecauseDestinationIsAlsoSource();
  } else {
    const { recipientError, recipientWarning } = await validateRecipient(
      a.currency,
      t.recipient
    );

    if (recipientError) {
      errors.recipient = recipientError;
    }

    if (recipientWarning) {
      warnings.recipient = recipientWarning;
    }
  }

  let estimatedFees = t.fees || BigNumber(0);
  let amount = t.amount;
  let totalSpent = estimatedFees;

  switch (t.mode) {
    case "send": {
      if (amount.lte(0) && !t.useAllAmount) {
        errors.amount = new AmountRequired();
      }

      if (!t.fees || !t.fees.gt(0)) {
        errors.fees = new FeeNotLoaded();
      }

      if (
        tokenAccount &&
        tokenAccount.type === "TokenAccount" &&
        !errors.recipient &&
        !(await recipientHasAsset(
          extractTokenId(tokenAccount.token.id),
          t.recipient,
          a
        ))
      ) {
        errors.recipient = new AlgorandASANotOptInInRecipient();
      }

      amount = t.useAllAmount
        ? tokenAccount
          ? tokenAccount.balance
          : a.spendableBalance.minus(estimatedFees)
        : amount;

      if (amount.lt(0)) {
        amount = BigNumber(0);
      }

      totalSpent = tokenAccount ? amount : amount.plus(estimatedFees);

      if (
        (amount.lte(0) && t.useAllAmount) || // if use all Amount sets an amount at 0
        (tokenAccount && a.spendableBalance.lt(estimatedFees)) || // if spendable balance lower than fees for token
        (!errors.recipient && !errors.amount && tokenAccount
          ? totalSpent.gt(tokenAccount.balance)
          : totalSpent.gt(a.spendableBalance)) // if spendable balance lower than total
      ) {
        errors.amount = new NotEnoughBalance();
      }
      break;
    }

    case "optIn": {
      if (!t.fees || !t.fees.gt(0)) {
        errors.fees = new FeeNotLoaded();
      }

      // This error doesn't need to be translate,
      // it will use to block until the user choose an assetId
      if (!t.assetId) {
        errors.assetId = new Error("Asset Id is not set");
      }

      const spendableBalance = await getSpendableMaxForOptIn(a);
      if (spendableBalance.lt(estimatedFees)) {
        errors.amount = new NotEnoughBalance();
      }
      break;
    }

    case "claimReward": {
      if (a.spendableBalance.lt(totalSpent)) {
        errors.amount = new NotEnoughBalance();
      }
      break;
    }
  }

  if (t.memo && t.memo.length > ALGORAND_MAX_MEMO_SIZE) {
    throw new Error("Memo is too long");
  }

  return Promise.resolve({
    errors,
    warnings,
    estimatedFees,
    amount,
    totalSpent,
  });
};

const sameFees = (a, b) => (!a || !b ? a === b : a.eq(b));

const prepareTransaction = async (a, t) => {
  let fees = t.fees;
  let amount = t.amount;
  let recipient = t.recipient;

  if (t.mode === "optIn" || t.mode === "claimReward") {
    recipient = a.freshAddress;
    amount = BigNumber(0);
  }

  if (recipient || t.mode !== "send") {
    let errors = (await validateRecipient(a.currency, recipient))
      .recipientError;

    errors = errors || (t.mode === "optIn" && !t.assetId);
    if (!errors) {
      const res = await calculateFees({
        a,
        t,
      });

      fees = res.estimatedFees;
    }
  }

  if (
    !sameFees(t.fees, fees) ||
    !sameFees(t.amount, amount) ||
    t.recipient !== recipient
  ) {
    return { ...t, fees, amount, recipient };
  }

  return t;
};

const estimateMaxSpendable = async ({
  account,
  parentAccount,
  transaction,
}) => {
  const mainAccount = getMainAccount(account, parentAccount);
  const t = await prepareTransaction(mainAccount, {
    ...createTransaction(),
    subAccountId: account.type === "Account" ? null : account.id,
    recipient: getAbandonSeedAddress(mainAccount.currency.id),
    ...transaction,
    useAllAmount: true,
  });
  const s = await getTransactionStatus(mainAccount, t);
  return s.amount;
};

const preload = async () => {};

const hydrate = () => {};

const currencyBridge: CurrencyBridge = {
  preload,
  hydrate,
  scanAccounts,
};

const accountBridge: AccountBridge<Transaction> = {
  createTransaction,
  updateTransaction,
  prepareTransaction,
  getTransactionStatus,
  sync,
  receive,
  signOperation,
  broadcast,
  estimateMaxSpendable,
};

export default { currencyBridge, accountBridge };
