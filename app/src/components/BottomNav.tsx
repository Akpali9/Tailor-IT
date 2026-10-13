import { NavLink } from "react-router-dom";
import Icon from "./Icon";
import type { Role } from "@/lib/types";

const CLIENT = [["/", "Home", "home"], ["/try-on", "Try-on", "sparkle"], ["/wardrobe", "Wardrobe", "hanger"], ["/fit", "Fit", "ruler"], ["/orders", "Orders", "bag"]] as const;
const DESIGNER = [["/", "Studio", "home"], ["/clients", "Clients", "people"], ["/production", "Production", "chart"], ["/collection", "Collection", "hanger"], ["/profile", "Profile", "user"]] as const;

export default function BottomNav({ role }: { role: Role }) {
  const items = role === "client" ? CLIENT : DESIGNER;
  return (
    <nav className="bottom-nav" aria-label="Main">
      {items.map(([to, label, icon]) => (
        <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
          <Icon name={icon} size={21} /><span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
