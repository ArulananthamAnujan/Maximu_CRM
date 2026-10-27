import { deliverClientNotices } from '../lib/client-notice-delivery.mjs';
export default async function handler() {
  console.log('Student notifications',await deliverClientNotices({env:name=>Netlify.env.get(name)}));
}
export const config={schedule:'* * * * *'};
