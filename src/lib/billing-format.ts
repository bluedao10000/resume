export const formatCredits = (units: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(
    units / 1000000,
  )
