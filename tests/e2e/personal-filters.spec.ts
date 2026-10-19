import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let folder: string, js: string, css: string;
test.beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), "crm-filter-test-"));
  await build({
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
      import React, {useState} from "react";
      import {createRoot} from "react-dom/client";
      import {PersonalFilters} from "./app/personal-filters";
      function Harness() {
        const [values,setValues]=useState({}), [query,setQuery]=useState("");
        const rows=[{name:"Anna",country:"Australia",status:"waiting"},{name:"Ben",country:"Canada",status:"waiting"},{name:"Cara",country:"Australia",status:"ready"}];
        const shown=rows.filter(r=>(!values.country||r.country===values.country)&&(!values.status||r.status===values.status)&&r.name.toLowerCase().includes(query.toLowerCase()));
        return <><label>Search<input value={query} onChange={e=>setQuery(e.target.value)}/></label>
          <PersonalFilters module="students" label="Students" query={query} values={values}
            onChange={(key,value)=>setValues(v=>({...v,[key]:value}))} onApply={(v,q)=>{setValues(v);setQuery(q);}}
            fields={[{key:"country",label:"Destination",options:["Australia","Canada"].map(value=>({value,label:value}))},{key:"status",label:"Documents",options:["waiting","ready"].map(value=>({value,label:value}))},{key:"from",label:"Created from",type:"date"}]}/>
          <output aria-label="Matching names">{shown.map(r=>r.name).join(", ")}</output></>;
      }
      createRoot(document.getElementById("root")).render(<Harness/>);
    ` },
    bundle: true, outfile: join(folder, "bundle.js"), jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  js = await readFile(join(folder, "bundle.js"), "utf8");
  css = await readFile(join(folder, "bundle.css"), "utf8");
});
test.afterAll(async () => { await rm(folder, { recursive: true, force: true }); });

test("combine and remove filters; save, restore, update and delete a personal view", async ({page}) => {
  let views: {id:string;name:string;filters:unknown}[] = [];
  await page.route("http://filters.test/**", async route => {
    if (route.request().url().includes("/api/crm/saved-views")) {
      if (route.request().method() === "POST") {
        const body=route.request().postDataJSON();
        if(body.action==="delete") views=views.filter(v=>v.id!==body.id);
        else views=[{id:"view-1",name:body.name,filters:body.filters}];
      }
      await route.fulfill({json:{ok:true,views}});
    } else await route.fulfill({contentType:"text/html",body:'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+css+'</style></head><body><div id="root"></div><script>'+js+'</script></body></html>'});
  });
  await page.goto("http://filters.test/");
  const add=page.getByLabel("Add filter",{exact:true});
  await add.selectOption("country");
  await page.getByLabel("Destination",{exact:true}).selectOption("Australia");
  await add.selectOption("status");
  await page.getByLabel("Documents",{exact:true}).selectOption("waiting");
  await expect(page.getByLabel("Matching names")).toHaveText("Anna");
  await page.getByRole("button",{name:"Remove Documents filter"}).click();
  await expect(page.getByLabel("Matching names")).toHaveText("Anna, Cara");
  await page.getByLabel("Search",{exact:true}).fill("Anna");
  await page.getByRole("button",{name:"Save view",exact:true}).click();
  await page.getByLabel("View name",{exact:true}).fill("Australia follow-ups");
  await page.getByRole("button",{name:"Save to my account"}).click();
  await expect(page.getByRole("region",{name:"Students filters"}).getByRole("status")).toHaveText("View saved to your account.");
  await page.reload();
  await page.getByLabel("My saved views",{exact:true}).selectOption("view-1");
  await expect(page.getByLabel("Search",{exact:true})).toHaveValue("Anna");
  await expect(page.getByLabel("Destination",{exact:true})).toHaveValue("Australia");
  await expect(page.getByLabel("Documents",{exact:true})).toHaveCount(0);
  await expect(page.getByLabel("Matching names")).toHaveText("Anna");
  await page.getByRole("button",{name:"Clear filters",exact:true}).click();
  await expect(page.getByLabel("Matching names")).toHaveText("Anna, Ben, Cara");
  await expect(page.getByLabel("Destination",{exact:true})).toHaveCount(0);
  await page.getByLabel("My saved views",{exact:true}).selectOption("view-1");
  await page.getByRole("button",{name:"Save view",exact:true}).click();
  await page.getByRole("button",{name:"Update saved view"}).click();
  await expect(page.getByRole("region",{name:"Students filters"}).getByRole("status")).toHaveText("View saved to your account.");
  expect(views).toHaveLength(1);
  page.on("dialog",dialog=>dialog.accept());
  await page.getByRole("button",{name:"Delete selected saved view"}).click();
  await expect(page.getByRole("region",{name:"Students filters"}).getByRole("status")).toContainText("Saved view deleted");
  expect(views).toHaveLength(0);
});

test("mobile filters stay usable when saved-view service fails", async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.route("http://filters.test/**",async route=>{
    if(route.request().url().includes("/api/")) await route.fulfill({status:503,json:{error:"Saved views temporarily unavailable."}});
    else await route.fulfill({contentType:"text/html",body:'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+css+'</style></head><body><div id="root"></div><script>'+js+'</script></body></html>'});
  });
  await page.goto("http://filters.test/");
  await expect(page.getByRole("alert")).toContainText("temporarily unavailable");
  await page.getByLabel("Add filter",{exact:true}).selectOption("country");
  await page.getByLabel("Destination",{exact:true}).selectOption("Canada");
  await expect(page.getByLabel("Matching names")).toHaveText("Ben");
  await page.getByRole("button",{name:"Save view",exact:true}).click();
  await page.getByLabel("View name",{exact:true}).fill("Canada");
  await page.getByRole("button",{name:"Save to my account"}).click();
  await expect(page.getByRole("alert")).toContainText("temporarily unavailable");
  await expect(page.getByLabel("Destination",{exact:true})).toHaveValue("Canada");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:"/tmp/maximus-filters-mobile.png",fullPage:true});
});
