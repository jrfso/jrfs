export type TransactionCallback<T = any> = () => Promise<T>;

/** A simple, naive transaction queue to run a single transaction at a time. */
export interface Transactions {
  /** Current status. */
  running?: boolean;
  /** Transactions to process in order. */
  queue: TransactionCallback[];
  /**
   * Adds a new transaction to the queue.
   * @param cb Function to be called when the transaction is executed.
   */
  add<T>(this: Transactions, cb: TransactionCallback<T>): Promise<T>;
}

export function createTransactions(): Transactions {
  return {
    queue: [],
    add,
  };
}

async function runTransactions(transactions: Transactions) {
  transactions.running = true;
  const { queue } = transactions;
  while (queue.length > 0) {
    const transact = queue.shift()!;
    await transact();
  }
  transactions.running = false;
}

function add<T>(this: Transactions, cb: TransactionCallback<T>): Promise<T> {
  let onReject: (reason?: any) => void;
  let onResolve: (value: T | PromiseLike<T>) => void;
  const completed = new Promise<T>((resolve, reject) => {
    onResolve = resolve;
    onReject = reject;
  });
  const transaction = async () => {
    let err: any | undefined;
    let result: any | undefined;
    try {
      result = cb();
    } catch (ex) {
      err = ex;
    }
    if (result && typeof result.then === "function") {
      result.then(onResolve).catch(onReject);
    } else if (err) {
      onReject(err);
    } else {
      onResolve(result);
    }
  };
  this.queue.push(transaction);
  if (!this.running) {
    runTransactions(this);
  }
  return completed;
}
