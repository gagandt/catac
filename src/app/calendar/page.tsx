import { CalendarView } from "./_components/calendar-view";

// Multi-exam date tracker: registration / admit-card / exam-day / result dates
// for CAT, GMAT, XAT, SNAP & NMAT, as a month calendar. Dates are refreshed by
// Claude via the /refresh-exam-dates skill.
export default function CalendarPage() {
	return <CalendarView />;
}
