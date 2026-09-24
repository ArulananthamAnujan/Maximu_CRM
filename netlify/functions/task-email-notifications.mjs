import { deliverTaskEmails } from '../lib/task-email-delivery.mjs';

export default async function handler() {
  const result = await deliverTaskEmails({ env: (name) => Netlify.env.get(name) });
  console.log('Task email delivery', result);
}

export const config = { schedule: '* * * * *' };
