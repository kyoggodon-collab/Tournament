import type { PublicState } from "@shared/types";
import TournamentSheet from "../components/TournamentSheet";

export default function ViewerPage({ state }: { state: PublicState }) {
  return (
    <main className="page viewer">
      {state.warnings.length > 0 ? (
        <ul className="warnings">
          {state.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      <TournamentSheet state={state} />
    </main>
  );
}
