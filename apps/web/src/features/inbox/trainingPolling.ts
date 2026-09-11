export function trainingRefreshInterval(batchPending: boolean): number | false {
  return batchPending ? 5_000 : false;
}
