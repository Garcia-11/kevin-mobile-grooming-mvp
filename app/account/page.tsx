import { AccountGate } from '@/app/account-controls';
import History from './history';
export const dynamic='force-dynamic';
export default function Page(){return <AccountGate><History/></AccountGate>}
