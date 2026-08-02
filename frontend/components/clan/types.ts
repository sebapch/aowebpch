export type ClanAlignment = "citizen" | "criminal";

export type ClanSummary = {
    id: string;
    name: string;
    alignment: ClanAlignment;
    minJoinLevel: number;
    memberCount: number;
    leaderName: string;
};

export type ClanMember = {
    characterId: string;
    name: string;
    classId: number;
    level: number;
    criminal: boolean;
    online: boolean | null;
    role: "leader" | "co_leader" | "member";
};

export type ClanRequest = {
    id: string;
    characterId: string;
    name: string;
    classId: number;
    level: number;
    criminal: boolean;
    online: boolean;
    message: string;
    createdAt: string;
};

export type ClanDetails = {
    id: string;
    name: string;
    alignment: ClanAlignment;
    minJoinLevel: number;
    leaderCharacterId: string;
    leaderName: string;
    memberCount: number;
    members: ClanMember[];
    requests: ClanRequest[];
};

export type ClanOverview = {
    currentClan: ClanDetails | null;
    clans: ClanSummary[];
    pendingRequestClanId: string | null;
};

export type ClanView = "list" | "detail" | "manage" | "create";

export type ClanMemberActionMenuState = {
    characterId: string;
    memberName: string;
    left: number;
    top: number;
};
