import type { Match, PublicState } from "@shared/types";
import TournamentSheet from "./TournamentSheet";

export default function BracketView({
  state,
  onSelect,
}: {
  state: PublicState;
  onSelect?: (match: Match) => void;
}) {
  return <TournamentSheet state={state} onSelect={onSelect} editable={Boolean(onSelect)} />;
}
