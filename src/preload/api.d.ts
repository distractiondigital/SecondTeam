// Shape of the bridge exposed to the UI as `window.secondTeam`.
export interface SecondTeamApi {
  getVersion: () => Promise<string>
}

declare global {
  interface Window {
    secondTeam: SecondTeamApi
  }
}
