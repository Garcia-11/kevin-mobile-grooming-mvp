import SignInForm from '@/app/login/sign-in-form';
import { AccountGate } from '@/app/account-controls';
export default function Page(){return <AccountGate><SignInForm passwordOnly/></AccountGate>}
