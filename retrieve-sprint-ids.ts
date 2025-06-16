import axios from 'axios';
import {    JIRA_BASE_URL,
    JIRA_EMAIL,
    JIRA_API_TOKEN
} from './credentials';
import {BOARD_ID} from "./config";

/**
 * Получает все спринт-ID для указанного boardId
 */
export async function getSprintIdsForBoard(boardId: number): Promise<{id: number, name: string}[]> {
    const sprintIds: {id: number, name: string}[] = [];
    let startAt = 0;
    const maxResults = 50;

    while (true) {
        const response = await axios.get(
            `${JIRA_BASE_URL}/rest/agile/1.0/board/${boardId}/sprint`,
            {
                params: { startAt, maxResults },
                auth: {
                    username: JIRA_EMAIL,
                    password: JIRA_API_TOKEN,
                },
            }
        );

        const data = response.data;
        sprintIds.push(...data.values.map((sprint: any) =>({id:  sprint.id, name:  sprint.name})));

        if (data.isLast || sprintIds.length >= data.total) break;

        startAt += maxResults;
    }

    return sprintIds;
}

async function main(){
    const ids:{id: number, name: string}[] = await getSprintIdsForBoard(parseInt(BOARD_ID))
    console.log('Sprint IDs:');
    ids.forEach(id=>{
        console.log(id);
    })
}

main().catch(error => console.log(error));