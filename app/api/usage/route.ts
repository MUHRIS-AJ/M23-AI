import { requireUser, errorResponse } from "@/lib/guard";
import { getCapStatus } from "@/lib/usage";

// Current user's spend + remaining budget for the active cap period.
export async function GET() {
  try {
    const user = await requireUser();
    const status = await getCapStatus(user.id);
    return Response.json(status);
  } catch (err) {
    return errorResponse(err);
  }
}
