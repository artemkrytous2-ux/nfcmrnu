import { DishPhoto } from "@/components/dish-photo";
import { menuPhotoUrl } from "@/lib/photos";

export function BeautyHero({
  name,
  description,
  banner,
}: {
  name: string;
  description: string;
  banner: string;
}) {
  const text = description.trim();
  const photo = menuPhotoUrl(banner);

  return (
    <header>
      {photo ? (
        <DishPhoto
          src={photo}
          alt=""
          className="aspect-[2/1] rounded-[18px]"
        />
      ) : (
        <div className="menu-banner relative aspect-[2/1] overflow-hidden rounded-[18px]">
          <div className="menu-photo-fallback absolute inset-0" />
          <div className="absolute inset-x-6 bottom-4 h-px bg-accent" />
        </div>
      )}
      <div className="mt-4">
        <h1 className="font-display text-[1.65rem] leading-[1.05] font-medium tracking-[-0.03em] text-foreground sm:text-4xl">
          {name}
        </h1>
        {text ? (
          <p className="mt-2 max-w-2xl text-sm leading-5 text-muted sm:text-[15px] sm:leading-6">{text}</p>
        ) : null}
      </div>
    </header>
  );
}
