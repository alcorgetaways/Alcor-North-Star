import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Building2, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { parsePropertyIds } from "@/lib/property-filter";

export function usePropertySelection() {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const ids = parsePropertyIds(search.props);
  const includeInternal = search.internal === true;
  const update = (nextIds: string[], internal = includeInternal) => void navigate({
    to: ".", search: (prev) => { const { props: _props, internal: _internal, ...rest } = prev; return { ...rest, ...(nextIds.length ? { props: nextIds.join(",") } : {}), ...(internal ? { internal: true } : {}) }; },
  });
  return { ids, includeInternal, update };
}

export type PropertyOption = { id: string; name: string; internal: boolean };
export function PropertyFilter({ options }: { options: PropertyOption[] }) {
  const { ids, includeInternal, update } = usePropertySelection();
  const [query, setQuery] = useState("");
  const available = [...new Map(options.map((o) => [o.id, o])).values()].filter((o) => includeInternal || !o.internal);
  const filtered = available.filter((o) => o.name.toLowerCase().includes(query.toLowerCase()));
  const single = options.find((o) => o.id === ids[0]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="max-w-full gap-2" aria-label="Properties">
          <Building2 className="h-4 w-4 shrink-0" />
          <span className="max-w-48 truncate">{ids.length === 0 ? "All properties" : ids.length === 1 ? single?.name ?? "1 property" : `${ids.length} properties`}</span>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] space-y-3">
        <p className="font-semibold">Properties</p>
        <div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Search properties" placeholder="Search properties" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" /></div>
        <label className="flex items-center justify-between gap-2 text-sm"><span>Include internal profiles</span><Switch checked={includeInternal} onCheckedChange={(v) => update(ids, v)} /></label>
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => update([])}>All properties</Button>
        <div className="max-h-64 overflow-y-auto space-y-1">
          {filtered.map((o) => <label key={o.id} className="flex cursor-pointer items-center gap-3 rounded-md p-2 text-sm hover:bg-muted"><Checkbox checked={ids.includes(o.id)} onCheckedChange={(checked) => update(checked ? [...ids, o.id] : ids.filter((id) => id !== o.id))} /><span>{o.name}{o.internal ? <span className="ml-1 text-xs text-muted-foreground">Internal</span> : null}</span></label>)}
          {!filtered.length ? <p className="py-3 text-sm text-muted-foreground">No matching properties</p> : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}