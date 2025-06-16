import axios from 'axios';
import * as ExcelJS from 'exceljs';
import {
    JIRA_BASE_URL,
    JIRA_EMAIL,
    JIRA_API_TOKEN,
} from './credentials';
import {BOARD_ID, EXCEL_FILE, SPRINT_IDS, STATUSES_TO_TRACK} from './config';
import {JiraChangelogEntry, JiraIssue} from "./models";
import * as fs from "node:fs";
import Row from "exceljs/index";

const authHeader = {
    headers: {
        Authorization: `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/json',
    },
};

const DATA_SHEET_NAME = 'Data';
const SUMMARY_SHEET_NAME = 'Summary';

interface StatusPeriod {
    status: string;
    start: number;
    end: number;
}

async function getActiveSprint(boardId: string): Promise<{ id: string; name: string }> {
    const url = `${JIRA_BASE_URL}/rest/agile/1.0/board/${boardId}/sprint?state=active`;
    const res = await axios.get(url, authHeader);
    const activeSprint = res.data.values[0];
    if (!activeSprint) throw new Error('❌ Активный спринт не найден');
    console.log(`✅ Найден активный спринт: ${activeSprint.name} (ID: ${activeSprint.id})`);
    return { id: activeSprint.id.toString(), name: activeSprint.name };
}

export async function getSprintNameById(sprintId: number): Promise<string> {
    const response = await axios.get(
        `${JIRA_BASE_URL}/rest/agile/1.0/sprint/${sprintId}`,
        {
            auth: {
                username: JIRA_EMAIL,
                password: JIRA_API_TOKEN,
            },
        }
    );

    return response.data.name;
}

async function fetchIssuesInSprint(sprintId: string): Promise<JiraIssue[]> {
    const url = `${JIRA_BASE_URL}/rest/agile/1.0/sprint/${sprintId}/issue?expand=changelog&maxResults=100`;
    const res = await axios.get(url, authHeader);
    return res.data.issues;
}

function calculateStatusPeriods(issue: JiraIssue): StatusPeriod[] {
    const changelog = issue.changelog.histories;
    const statusChanges = changelog
        .flatMap((entry: JiraChangelogEntry ) =>
            entry.items
                .filter((i) => i.field === 'status')
                .map((i) => ({
                    from: i.fromString,
                    to: i.toString,
                    time: new Date(entry.created).getTime(),
                }))
        )
        .sort((a, b) => a.time - b.time);

    const periods: StatusPeriod[] = [];
    let prevTime = new Date(issue.fields.created).getTime();
    let prevStatus = statusChanges[0]?.from || issue.fields.status.name;

    for (const change of statusChanges) {
        if (prevStatus !== 'Closed') {
            periods.push({
                status: prevStatus,
                start: prevTime,
                end: change.time,
            });
        }
        prevTime = change.time;
        prevStatus = change.to;
    }

    if (prevStatus !== 'Closed') {
        periods.push({
            status: prevStatus,
            start: prevTime,
            end: Date.now(),
        });
    }

    return periods;
}

async function exportToExcel(
    data: {
        key: string;
        summary: string;
        periods: StatusPeriod[];
    }[],
    sprintId: string,
    sprintName: string
) {
    const workbook = new ExcelJS.Workbook();

    if (fs.existsSync(EXCEL_FILE)) {
        await workbook.xlsx.readFile(EXCEL_FILE);
    }

    let rows:Row[] = [];
    const dataSheet = workbook.getWorksheet(DATA_SHEET_NAME);
    if( dataSheet ) {
        rows = dataSheet.getRows(1, dataSheet.rowCount ) ?? [];
    }
    
    const validRows = rows
        .map(r => r.values as any[])
        .filter(values => values.some(cell => !!cell));


    if (validRows.length === 0) {
        validRows.push([
            'Sprint ID',
            'Sprint Name',
            'Issue Key',
            'Summary',
            'Status',
            'Start',
            'End',
            'Duration (h)',
        ]);
    }
    
    for (const issue of data) {
        for (const period of issue.periods) {
            validRows.push([
                sprintId,
                sprintName,
                issue.key,
                issue.summary,
                period.status,
                new Date(period.start).toISOString(),
                new Date(period.end).toISOString(),
                parseFloat(((period.end - period.start) / 3600000).toFixed(2)),
            ]);
        }
    }
    if(dataSheet){
        workbook.removeWorksheetEx(dataSheet)
    }
    const sheet = workbook.addWorksheet(DATA_SHEET_NAME);
   
    validRows.forEach((row) => {
        sheet.addRow(row);
    })
    
    await calculateSummary(workbook)
    
    await workbook.xlsx.writeFile(EXCEL_FILE);
    console.log('✅ Excel-файл обновлён: jira-status-periods.xlsx');
}


async function calculateSummary(workbook: ExcelJS.Workbook) {
    const dataSheet = workbook.getWorksheet(DATA_SHEET_NAME)!;
    const headers = (dataSheet.getRow(1).values as string[]).slice(1); // .slice(1) потому что values[0] — пустой
    const headerMap: Record<string, number> = {};
    headers.forEach((h, i) => (headerMap[h] = i));

    type RowData = {
        sprint: string;
        status: string;
        duration: number;
    };

    
    const data: RowData[] = dataSheet.getRows(2, dataSheet.rowCount - 1)!.map(row => ({
        sprint: row.getCell(2).value as string,
        status: row.getCell(5).value as string,
        duration: row.getCell(8).value as number,
    }));

    // Группировка по спринтам и статусам
    const sprintStatusMap = new Map<string, Map<string, number[]>>();
    const allStatuses = new Set<string>();

    for (const { sprint, status, duration } of data) {
        if (!sprint || !status) continue;

        if (!sprintStatusMap.has(sprint)) {
            sprintStatusMap.set(sprint, new Map());
        }

        const statusMap = sprintStatusMap.get(sprint)!;
        if (!statusMap.has(status)) {
            statusMap.set(status, []);
        }

        statusMap.get(status)!.push(duration);
        allStatuses.add(status);
    }

    const filteredStatuses = Array.from(allStatuses).sort().filter(status=>STATUSES_TO_TRACK.includes(status));

    

    const summarySheet =workbook.getWorksheet(SUMMARY_SHEET_NAME)!;
    // не можем удалить существующий лист, тк он используется в графиках. но можем очистить его
    if (summarySheet) {
        summarySheet.getRows(1, summarySheet.rowCount)!.forEach(row => row.values = []);
    }
    

    // Заголовки
    summarySheet.insertRow(1,['Sprint Name', ...filteredStatuses, 'AvgDuration']);

    let sprintIndex = 1;
    for (const [sprint, statusMap] of sprintStatusMap.entries()) {
        const row: (string | number)[] = [sprint];
        let total = 0;

        for (const status of allStatuses) {
            const durations = statusMap.get(status) || [];
            const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
            if(STATUSES_TO_TRACK.includes(status)) {
                row.push(Number(avg.toFixed(2)));
            }
            total += avg;
        }

        row.push(Number(total.toFixed(2)));
        summarySheet.insertRow(sprintIndex+1,row);
        sprintIndex++;
    }

    await workbook.xlsx.writeFile(EXCEL_FILE);
    console.log('Summary sheet updated.');
}



async function parseSprint(sprint: { id: string; name: string }) {
    const issues = await fetchIssuesInSprint(sprint.id);
    const result = issues
        .filter((issue: JiraIssue) => issue.fields.issuetype.name !== 'Problem')
        .map((issue: JiraIssue) => ({
            key: issue.key,
            summary: issue.fields.summary,
            periods: calculateStatusPeriods(issue),
        }));

    await exportToExcel(result, sprint.id, sprint.name);
}

async function main() {
    if(!SPRINT_IDS.length) {
        const sprint = await getActiveSprint(BOARD_ID);
        await parseSprint(sprint)
    }else {
        for (const sprintId of SPRINT_IDS) {
            const name  = await getSprintNameById(sprintId);
            await parseSprint({name, id: sprintId.toString()})
        }
    }
   
    
}

main().catch(console.error);