export type Ticket = {
  id: string;
  ticketNo: string;
  queueId: string;
  subItemId?: string;
  subSubItemId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  issueDescription: string;
  justifyReason?: string | null;
  ticketStatus:
    | 'Not Served'
    | 'Serving'
    | 'Served'
    | 'Hold'
    | 'Redirected'
    | 'Cancelled'
    | 'No Show'
    | 'Expired';
  counterId: string | null;
  pendingRedirectAcceptance?: boolean;
  callAgain?: boolean;
  holdComment?: string | null;
  phoneNumber?: string | null;
  multipleTransactions?: TransactionSelection[] | string | null;
  ratingSmsDeferred?: boolean;
};

export type ActiveCounter = {
  id: string;
  userId: string;
  counterNumber: number;
  queueId: string;
  queue: { id: string; name: string };
  branchId: string;
  available: boolean;
  unavailableReason?: string | null;
  averageServingTime?: string;
  averageServingSeconds?: number;
};

export type QueueItem = {
  id: string;
  menuItem: {
    name: string;
    subMenuItems: Array<{
      id: string;
      name: string;
      priority?: boolean;
      subSubMenuItems?: Array<{ id: string; name: string; priority?: boolean }>;
    }>;
  };
};

export type AvailableCounter = {
  id: string;
  number: number;
  queueName: string;
};

export type TransactionSelection = {
  queueId: string;
  subItemId?: string;
  subSubItemId?: string;
  count?: number;
};

export type ServingActionPending =
  | 'clearing'
  | 'holding'
  | 'callingAgain'
  | 'redirecting'
  | 'fetchingNext'
  | 'unholding'
  | 'claimingRedirect'
  | 'markingNoShow'
  | 'togglingAvailability'
  | 'savingTransactions'
  | 'updatingJustify'
  | 'changingCategory'
  | null;

export type CounterWorkAction = 'served' | 'held' | 'redirected' | 'no_show';

export type CounterWorkHistoryItem = {
  ticketId: string;
  ticketNo: string;
  phoneNumber: string | null;
  issueDescription: string;
  waitingTime: number;
  servingTime: number;
  holdTime: number;
  action: CounterWorkAction;
  actionAt: string;
};

export type ServingReportsStats = {
  totalTickets: number;
  averageWaitingTime: number;
  averageServingTime: number;
  averageHoldTime: number;
};

export type ServingReportsActionCounts = {
  served: number;
  held: number;
  redirected: number;
  no_show: number;
};

export type ServingReportsResponse = {
  date: string;
  counterNumber: number | null;
  stats: ServingReportsStats;
  actionCounts: ServingReportsActionCounts;
  tickets: CounterWorkHistoryItem[];
};

export type TicketServiceHistoryItem = {
  id: string;
  sequence: number;
  ticketStatus: string;
  startedAt: string;
  endedAt: string | null;
  duration: number;
  holdComment?: string | null;
  endReason?: string | null;
  counter?: { id: string; counterNumber: number } | null;
  user?: {
    id: string;
    username: string;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  redirectedFromCounter?: { id: string; counterNumber: number } | null;
  redirectedToCounter?: { id: string; counterNumber: number } | null;
};
