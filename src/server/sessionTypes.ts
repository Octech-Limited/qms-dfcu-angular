export type SessionActorType = 'dashboard' | 'serving' | 'admin';

export type PublicSession = {
	isLoggedIn: boolean;
	userId?: string;
	username?: string;
	role?: string;
	actorType?: SessionActorType;
	branchId?: string;
	counterId?: string;
	department?: string;
	permissions?: Record<string, boolean>;
	hallDisplayUsername?: string;
	expiresAt?: number;
};

export interface SessionFields {
	userId?: string;
	username?: string;
	sessionToken?: string;
	isLoggedIn: boolean;
	role?: string;
	actorType?: SessionActorType;
	branchId?: string;
	counterId?: string;
	department?: string;
	permissions?: Record<string, boolean>;
	hallDisplayUsername?: string;
	expiresAt: number;
}
