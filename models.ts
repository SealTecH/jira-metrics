export interface JiraIssue {
    key: string;
    fields: {
        issuetype:{
            name: string;
        };
        summary: string;
        status: {
            name: string;
        };
        created: string;
    };
    changelog: {
        histories: JiraChangelogEntry[];
    };
}

export interface JiraChangelogEntry {
    created: string;
    items: {
        field: string;
        fromString: string;
        toString: string;
    }[];
}