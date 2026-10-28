import { createFileRoute } from "@tanstack/react-router";
import { plausibleSecretHeader, secretsMatch } from "@/lib/security-rules";
export const Route=createFileRoute("/api/public/hooks/kpi-source-sync")({server:{handlers:{POST:async({request})=>{
  const provided=request.headers.get("x-kpi-sync-secret");
  const expected=process.env["KPI_SYNC_SECRET"]??"";
  if(!plausibleSecretHeader(provided)||!(await secretsMatch(provided,expected)))return new Response("Unauthorized",{status:401});
  const credentials={metricoolToken:process.env["METRICOOL_API_TOKEN"]??"",metricoolUser:process.env["METRICOOL_USER_ID"]??"",localoToken:process.env["LOCALO_MCP_TOKEN"]??"",localoOrg:process.env["LOCALO_ORG_ID"]??""};
  const {runMappedHistory}=await import("@/lib/kpi-sync-runner.server");
  const result=await runMappedHistory(credentials);
  return Response.json(result,{headers:{"Cache-Control":"no-store"}});
}}}});