export function shouldShowAcceptButton(isFreshFetch: boolean, sameAsCurrent: boolean): boolean {
  return isFreshFetch && !sameAsCurrent;
}
