1. Create file `credentials.ts` in the root directory of the project with the following content:
```typescript
export const JIRA_BASE_URL = 'https://creatio.atlassian.net/';
export const JIRA_EMAIL = 'youremail@creatio.com';
export const JIRA_API_TOKEN = ''; // Your API token here. You can generate it in your Jira account settings here  https://id.atlassian.com/manage-profile/security/api-tokens

```
2. in `config.ts` set `BOARD_ID` property. You can find the board ID in the URL of your Jira board, it looks like `https://creatio.atlassian.net/jira/software/c/projects/PROJECT_NAME/boards/BOARD_ID`.
   ```typescript
   export const BOARD_ID = '123'; // Replace with your actual board ID
   ```
3. run `npm install` to install the required dependencies.
4. OPTIONAL: by default script takes active sprint. if you want to generate metrics for specific sprints, run `npx ts-node retrieve-sprint-ids.ts`. Then put ids of sprints in `SPRINT_IDS` array in `config.ts` file.
5. Run `npx ts-node jira-status-metrics.ts` for running the script.
6. Enjoy the metrics in file `output.xlsx` in the root directory of the project. (don't forget to enable automatic links update in Excel)