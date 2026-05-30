import { backendSupabase, ticketingFunctionsSupabase } from './backend-supabase';
import { ticketingFunctionHeaders } from './ticketing-function-auth';

export { ticketingFunctionHeaders } from './ticketing-function-auth';

export async function invokeTicketingFunction<T>(
  functionName: string,
  options: { body?: unknown } = {}
) {
  const { data } = await backendSupabase.auth.getSession();

  return ticketingFunctionsSupabase.functions.invoke<T>(functionName, {
    ...options,
    headers: ticketingFunctionHeaders(data.session?.access_token),
  });
}
