// @flow
import type { CurrenciesData } from "../../../__tests__/test-helpers/bridge";
import type { Transaction } from "../types";

const dataset: CurrenciesData<Transaction> = {
  scanAccounts: [
    {
      name: "pivx seed 1",
      apdus: `
      => e040000009028000002c8000004d
      <= 4104894dea4095da14ddbac584ae848971e8dc31e2dae934d06f6893badcf9ca254839e3a0cc35201f30c95b03edfcf53828c1c12df38c2eccbca05fff96ce78a1c22244435a695a6d6741547a543431394a4469424a6d7452335a4431546f5854786754389c380247e743a415ab2ea2264e42c18fba697e5d3858cc42647addb824d60c8d9000
      => e016000000
      <= 001e000d01074461726b4e6574035049569000
      => e040000009028000002c8000004d
      <= 4104894dea4095da14ddbac584ae848971e8dc31e2dae934d06f6893badcf9ca254839e3a0cc35201f30c95b03edfcf53828c1c12df38c2eccbca05fff96ce78a1c22244435a695a6d6741547a543431394a4469424a6d7452335a4431546f5854786754389c380247e743a415ab2ea2264e42c18fba697e5d3858cc42647addb824d60c8d9000
      => e04000000d038000002c8000004d80000000
      <= 41043033e076f8f256ab52d75c4f7b576563aacf76adc22f8bcc15fae33d939bf891ee25d302f52b1abcaa9bbebb7a7f0daec82fb209fd7efa768dabccd92274857d22444e474c6974797831444b4a4b444873744e70654376346167515755626466506354d2ca1af075522cbf0a01a95ce8c7164693ad38975b86ddd2012dc27b096d40c49000
      => e04000000d038000002c8000004d80000001
      <= 41043bf8c4fcfa955d42822f2047019138ef7a86d1ac6df79fc0965159093cc3243b7afcb86984e5d7cc8d732525713ff2157401ec47b69595cdccfa69920bb3edd32244373957683144446e4b5238336761595141664a48366f51726d6f797674726e434a7fbbb79d71db86b6f969780b993250acf50d39efdfd9f6fcf8e47ea1459e613a9000
      => e04000000d038000002c8000004d80000002
      <= 4104692279bad5799fc3d91849ac33274b70e69fbef152321725fe4672b84fda6e332c1c1e85b48f9ff6c4ea169c4f4ca233ff2c386c827360cedb76a106a2bd7d362244436d645663476e3242684e59364c7939333473435145453250724868706a5970596c2f4658e22ebd7dab725ec5f5cfc367d070343777b512761f40704b879fc5b69000
      `
    }
  ]
};

export default dataset;