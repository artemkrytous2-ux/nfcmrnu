import { BeautyBooking } from "@/components/beauty/beauty-booking";
import { BeautyContacts } from "@/components/beauty/beauty-contacts";
import { BeautyHero } from "@/components/beauty/beauty-hero";
import { BeautyServices } from "@/components/beauty/beauty-services";
import type { MenuState } from "@/lib/menu";

export function BeautySite({ menu }: { menu: MenuState }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-8 sm:py-8">
      <BeautyHero
        name={menu.venue.name}
        description={menu.venue.description}
        banner={menu.venue.banner}
      />
      <BeautyServices categories={menu.categories} services={menu.dishes} />
      <BeautyContacts venue={menu.venue} />
      <BeautyBooking venue={menu.venue} />
    </div>
  );
}
