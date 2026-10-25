export const HARNESS_SESSION_ID = '42';

export const HARNESS_SETTINGS = { warehouseId: 'wh1', inspireDatabase: 'main.inspire', notebookPath: '' };

export const HARNESS_USE_CASE = {
  id: 'N01-U01',
  Name: 'Predict churn',
  use_case: 'Predict churn',
  statement: 'Cut churn in the top segment',
  sponsor: 'Head of Retention',
  primary_table: 'main.s.orders',
  tables_involved: 'main.s.orders,main.s.returns',
  genie_instruction: '## Parameters\n| top_k | text | 25 | Top K |\n',
};
