// @flow
import { from, Observable } from "rxjs";
import { map } from "rxjs/operators";
import invariant from "invariant";
import flatMap from "lodash/flatMap";
import zipWith from "lodash/zipWith";
import { BigNumber } from "bignumber.js";
import { getValidators } from "./validators";
import type { Transaction, AccountLike } from "../../types";
import type { CosmosDelegationInfo } from "./types";

const options = [
  {
    name: "mode",
    type: String,
    desc: "mode of transaction: send, deletage, undelegate",
  },
  {
    name: "fees",
    type: String,
    desc: "how much fees",
  },
  {
    name: "gasLimit",
    type: String,
    desc: "how much gasLimit. default is estimated with the recipient",
  },
  {
    name: "memo",
    type: String,
    desc: "add a memo to a transaction",
  },
  {
    name: "cosmosSourceValidator",
    type: String,
    desc: "for redelegate, add a source validator",
  },
  {
    name: "cosmosValidator",
    type: String,
    multiple: true,
    desc: "address of recipient validator that will receive the delegate",
  },
  {
    name: "cosmosAmountValidator",
    type: String,
    multiple: true,
    desc: "Amount that the validator will receive",
  },
];

function inferTransactions(
  transactions: Array<{ account: AccountLike, transaction: Transaction }>,
  opts: Object,
  { inferAmount }: *
): Transaction[] {
  return flatMap(transactions, ({ transaction, account }) => {
    invariant(transaction.family === "cosmos", "cosmos family");

    const validatorsAddresses: string[] = opts["cosmosValidator"] || [];
    const validatorsAmounts: BigNumber[] = (
      opts["cosmosAmountValidator"] || []
    ).map((value) => {
      return inferAmount(account, value);
    });

    const validators: CosmosDelegationInfo[] = zipWith(
      validatorsAddresses,
      validatorsAmounts,
      (address, amount) => ({
        address,
        amount: amount || BigNumber(0),
      })
    );

    return {
      ...transaction,
      family: "cosmos",
      mode: opts.mode || "send",
      memo: opts.memo,
      fees: opts.fees ? inferAmount(account, opts.fees) : null,
      gasLimit: opts.gasLimit ? new BigNumber(opts.gasLimit) : null,
      validators: validators,
      cosmosSourceValidator: opts.cosmosSourceValidator,
    };
  });
}

const cosmosValidatorsFormatters = {
  json: (list) => JSON.stringify(list),
  default: (list) =>
    list
      .map(
        (v) =>
          `${v.validatorAddress} "${v.name}" ${v.votingPower} ${v.commission} ${v.estimatedYearlyRewardsRate}`
      )
      .join("\n"),
};

const cosmosValidators = {
  args: [
    {
      name: "format",
      desc: Object.keys(cosmosValidatorsFormatters).join(" | "),
      type: String,
    },
  ],
  job: ({ format }: $Shape<{ format: string }>): Observable<string> =>
    from(getValidators()).pipe(
      map((validators) => {
        const f =
          cosmosValidatorsFormatters[format] ||
          cosmosValidatorsFormatters.default;
        return f(validators);
      })
    ),
};

export default {
  options,
  inferTransactions,
  commands: {
    cosmosValidators,
  },
};
