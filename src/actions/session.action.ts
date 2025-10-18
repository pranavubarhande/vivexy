"use server";

import { z } from "zod";
import { ZSAError, createServerAction } from "zsa";
import { getSessionFromCookie } from "@/utils/auth";
import { updateKVSessionSelectedTeam } from "@/utils/kv-session";

const updateSelectedTeamSchema = z.object({
  selectedTeam: z.string().optional(),
});

/**
 * Update the selected team for the current user's session
 */
export const updateSelectedTeamAction = createServerAction()
  .input(updateSelectedTeamSchema)
  .handler(async ({ input }) => {
    try {
      const session = await getSessionFromCookie();

      if (!session) {
        throw new ZSAError(
          "FORBIDDEN",
          "You must be logged in to update your selected team"
        );
      }

      // Validate that the selected team exists in the user's teams (if provided)
      if (input.selectedTeam && session.teams) {
        const teamExists = session.teams.some(team => team.id === input.selectedTeam);
        if (!teamExists) {
          throw new ZSAError(
            "FORBIDDEN",
            "Team not found or you are not a member"
          );
        }
      }

      const updatedSession = await updateKVSessionSelectedTeam(
        session.id,
        session.userId,
        input.selectedTeam
      );

      if (!updatedSession) {
        throw new ZSAError(
          "INTERNAL_SERVER_ERROR",
          "Failed to update selected team"
        );
      }

      return {
        success: true,
        selectedTeam: updatedSession.selectedTeam
      };
    } catch (error) {
      console.error("Failed to update selected team:", error);

      if (error instanceof ZSAError) {
        throw error;
      }

      throw new ZSAError(
        "INTERNAL_SERVER_ERROR",
        "Failed to update selected team"
      );
    }
  });
