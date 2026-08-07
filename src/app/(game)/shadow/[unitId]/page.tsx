import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Map as MapIcon } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { ShadowPractice } from "@/components/app/shadow-practice";
import { getCurrentUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content/load";
import { getGameBootstrap } from "@/lib/game/bootstrap";
import { shadowSegments } from "@/lib/game/shadow-track";
import { SHADOW_LEVEL_LABEL } from "@/lib/content/schema";

// 影子跟读练习页:从地图的「跟读」节点进来,一次练一段(?seg=N)。左边句子清单,
// 右边练习壳(句级 A-B 循环 + 保音调变速 + 录音 + 双波形 + 前端打分 + 五步闭环)。

export default async function ShadowPage({
  params,
  searchParams,
}: {
  params: Promise<{ unitId: string }>;
  searchParams: Promise<{ seg?: string }>;
}) {
  const { unitId } = await params;
  const { seg: segRaw } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const unit = getContent().shadowUnitsById.get(unitId);
  if (!unit) notFound();

  const segs = shadowSegments(unit.sentences.length);
  const seg = Math.min(Math.max(0, Number(segRaw ?? 0) || 0), segs.length - 1);
  const range = segs[seg];
  const slice = unit.sentences.slice(range.from, range.to + 1);

  const bootstrap = await getGameBootstrap(user);

  const bvid =
    unit.bvid ?? unit.source.url.match(/\/video\/(BV[0-9A-Za-z]+)/)?.[1] ?? "";

  return (
    <AppShell bootstrap={bootstrap} routeTitle={unit.title} routeSubject="en">
      <div className="shadow-page app-skin">
        <header className="shadow-hero" style={{ background: "var(--app-pink)" }}>
          <Link className="shadow-hero-back" href="/play">
            <MapIcon size={16} aria-hidden /> 地图
          </Link>
          <span className="shadow-hero-tier">
            {SHADOW_LEVEL_LABEL[unit.level]}
            {segs.length > 1 ? ` · 第 ${seg + 1}/${segs.length} 段` : ""}
          </span>
          <h1>{unit.title}</h1>
          {unit.description && <p>{unit.description}</p>}
        </header>

        <ShadowPractice
          unitId={unit.id}
          seg={seg}
          bvid={bvid}
          page={unit.page}
          sentences={slice}
        />
      </div>
    </AppShell>
  );
}
