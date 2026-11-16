/**
 * The marketing surface's parts (docs/design/marketing.md). Kit tokens only;
 * closed variants, no `className` or `style`. Pictures live in
 * components/showcase/demos.
 */
export { MarketingShell } from "./shell"
export { MarketingHeader } from "./header"
export { MarketingFooter } from "./footer"
export { NavLink, type NavLinkProps } from "./nav-link"
export {
  Section,
  SectionHeading,
  SectionPicture,
  SectionActions,
  SectionMark,
  type SectionProps,
  type SectionPosition,
  type SectionLayout,
  type SectionHeadingProps,
  type SectionHeadingSize,
  type SectionPictureProps,
  type SectionPictureWidth,
} from "./section"
export {
  MarketingButton,
  MarketingButtonLink,
  type MarketingButtonProps,
  type MarketingButtonLinkProps,
  type MarketingButtonVariant,
  type MarketingButtonSize,
} from "./button"
export { WaitlistForm, type WaitlistFormProps } from "./waitlist-form"
export { NeverList } from "./never-list"
export { HomePage } from "./home"
