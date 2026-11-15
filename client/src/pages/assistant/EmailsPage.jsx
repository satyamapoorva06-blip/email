// /app/emails?filter=… — one list component, titled per queue.
import { useSearchParams } from 'react-router-dom';
import EmailList from '../../components/EmailList';

const FILTERS = {
  all: { title: 'All Emails', subtitle: 'Every open conversation', emptyTitle: 'Inbox zero — nicely done', emptyBody: 'All conversations are handled, archived or completed. New mail will appear here.' },
  assistant: { title: 'Assistant to Reply', subtitle: 'Logistics & coordination you can handle', emptyTitle: 'Nothing for you to handle', emptyBody: 'Threads the AI routes to the assistant will appear here.' },
  client: { title: 'Client to Reply', subtitle: 'Waiting on the client’s decision', emptyTitle: 'Client’s plate is clear', emptyBody: 'When the AI spots a decision only the client can make, it waits here.' },
  none: { title: 'No Reply Needed', subtitle: 'Automated mail, receipts and newsletters', emptyTitle: 'No automated mail', emptyBody: 'Newsletters and notifications the AI filed away will appear here.' },
  action: { title: 'Action Required', subtitle: 'Decisions, approvals and low-confidence threads', emptyTitle: 'Nothing needs action', emptyBody: 'Approvals, client decisions and threads flagged for human review appear here.' },
  waiting: { title: 'Waiting for Response', subtitle: 'Follow-ups you sent — no reply yet', emptyTitle: 'All caught up', emptyBody: 'Threads where you’re awaiting the other side appear here with due-time hints.' },
  important: { title: 'Important', subtitle: 'High-priority and starred threads', emptyTitle: 'Nothing starred or urgent', emptyBody: 'Star a thread or the AI will surface time-sensitive mail here.' },
  archived: { title: 'Archived & Completed', subtitle: 'Filed away — kept for reference', emptyTitle: 'Archive is empty', emptyBody: 'Archived and completed conversations appear here.' },
};

export default function EmailsPage() {
  const [params] = useSearchParams();
  const filter = FILTERS[params.get('filter')] ? params.get('filter') : 'all';
  const meta = FILTERS[filter];
  return <EmailList key={filter} filter={filter} {...meta} />;
}
