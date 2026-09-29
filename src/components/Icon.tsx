import type { CSSProperties, HTMLAttributes } from "react";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Ban,
  Bell,
  BellOff,
  Book,
  Box,
  Boxes,
  Bug,
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  Circle,
  CircleAlert,
  CircleCheck,
  Clock,
  CloudRain,
  Code,
  Coffee,
  Copy,
  Cpu,
  Database,
  Download,
  DraftingCompass,
  Earth,
  Ellipsis,
  ExternalLink,
  Eye,
  File,
  FileArchive,
  FileDown,
  FileImage,
  FileInput,
  FileOutput,
  FileText,
  Flame,
  FlaskConical,
  Folder,
  FolderOpen,
  FolderTree,
  Gamepad2,
  Gem,
  Hammer,
  Hand,
  Heart,
  History,
  House,
  IdCard,
  Image,
  Images,
  Info,
  KeyRound,
  Languages,
  LayoutGrid,
  Layers,
  Link,
  List,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  MailOpen,
  Map as MapIcon,
  MessageSquare,
  MessagesSquare,
  Minimize2,
  Network,
  Package,
  Palette,
  Pen,
  Pin,
  Play,
  Plus,
  Puzzle,
  RefreshCw,
  Reply,
  Rocket,
  RotateCcw,
  RotateCw,
  Save,
  Scale,
  ScrollText,
  Search,
  Send,
  Server,
  Settings,
  Share,
  Share2,
  ShieldHalf,
  Shirt,
  SlidersHorizontal,
  Smartphone,
  Smile,
  Square,
  Star,
  Sun,
  Terminal,
  ThumbsUp,
  Trash,
  Trash2,
  TriangleAlert,
  Truck,
  Undo2,
  Upload,
  User,
  UserCheck,
  UserCog,
  UserMinus,
  UserPen,
  UserPlus,
  Users,
  VenetianMask,
  WandSparkles,
  Waves,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  "angles-down": ChevronsDown,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "arrow-right-from-bracket": LogOut,
  "arrow-rotate-left": Undo2,
  "arrow-up-from-bracket": Upload,
  "arrow-up-right-from-square": ExternalLink,
  "arrows-rotate": RefreshCw,
  ban: Ban,
  bell: Bell,
  "bell-slash": BellOff,
  book: Book,
  box: Package,
  "box-archive": Archive,
  bug: Bug,
  camera: Camera,
  certificate: BadgeCheck,
  check: Check,
  "check-double": CheckCheck,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "circle-check": CircleCheck,
  "circle-exclamation": CircleAlert,
  "circle-info": Info,
  "circle-nodes": Network,
  clock: Clock,
  "clock-rotate-left": History,
  "cloud-rain": CloudRain,
  code: Code,
  comment: MessageSquare,
  comments: MessagesSquare,
  "compass-drafting": DraftingCompass,
  compress: Minimize2,
  copy: Copy,
  cube: Box,
  cubes: Boxes,
  "cubes-stacked": Boxes,
  database: Database,
  download: Download,
  "earth-americas": Earth,
  ellipsis: Ellipsis,
  "envelope-open-text": MailOpen,
  eye: Eye,
  "face-smile": Smile,
  file: File,
  "file-arrow-down": FileDown,
  "file-export": FileOutput,
  "file-image": FileImage,
  "file-import": FileInput,
  "file-lines": FileText,
  "file-zipper": FileArchive,
  fire: Flame,
  flask: FlaskConical,
  "floppy-disk": Save,
  folder: Folder,
  "folder-open": FolderOpen,
  "folder-tree": FolderTree,
  gamepad: Gamepad2,
  gear: Settings,
  gem: Gem,
  hammer: Hammer,
  "hand-fist": Hand,
  hand: Hand,
  heart: Heart,
  house: House,
  "id-badge": IdCard,
  image: Image,
  images: Images,
  key: KeyRound,
  language: Languages,
  "layer-group": Layers,
  link: Link,
  list: List,
  lock: Lock,
  "magnifying-glass": Search,
  "magnifying-glass-minus": ZoomOut,
  "magnifying-glass-plus": ZoomIn,
  map: MapIcon,
  meteor: Rocket,
  microchip: Cpu,
  "mobile-screen": Smartphone,
  "mug-hot": Coffee,
  palette: Palette,
  "paper-plane": Send,
  pen: Pen,
  play: Play,
  plus: Plus,
  "puzzle-piece": Puzzle,
  reply: Reply,
  "right-to-bracket": LogIn,
  "rotate-left": RotateCcw,
  "rotate-right": RotateCw,
  "scale-balanced": Scale,
  scroll: ScrollText,
  server: Server,
  share: Share,
  "share-nodes": Share2,
  "shield-halved": ShieldHalf,
  shirt: Shirt,
  sliders: SlidersHorizontal,
  spinner: Loader2,
  star: Star,
  stop: Square,
  sun: Sun,
  "table-cells-large": LayoutGrid,
  terminal: Terminal,
  "thumbs-up": ThumbsUp,
  thumbtack: Pin,
  trash: Trash,
  "trash-can": Trash2,
  "triangle-exclamation": TriangleAlert,
  "truck-fast": Truck,
  "up-right-from-square": ExternalLink,
  user: User,
  "user-check": UserCheck,
  "user-gear": UserCog,
  "user-group": Users,
  "user-minus": UserMinus,
  "user-pen": UserPen,
  "user-plus": UserPlus,
  "user-secret": VenetianMask,
  "wand-magic-sparkles": WandSparkles,
  "wand-sparkles": WandSparkles,
  water: Waves,
  xmark: X,
};

const FILLABLE = new Set(["star", "heart"]);

const BRANDS: Record<string, string> = {
  discord:
    "M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z",
  telegram:
    "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z",
  microsoft: "M0 0h11.4v11.4H0zM12.6 0H24v11.4H12.6zM0 12.6h11.4V24H0zM12.6 12.6H24V24H12.6z",
};

const STYLE_TOKENS = new Set(["fa-solid", "fa-regular", "fa-brands", "fa-fw", "fa-spin"]);

type Props = Omit<HTMLAttributes<SVGElement>, "className"> & {

  cls: string;
  style?: CSSProperties;
};

export default function Icon({ cls, style, ...rest }: Props) {
  const tokens = cls.split(/\s+/).filter(Boolean);
  const own = tokens.filter((t) => !t.startsWith("fa-"));
  const fa = tokens.filter((t) => t.startsWith("fa-"));
  const name = fa.find((t) => !STYLE_TOKENS.has(t))?.slice(3) ?? "";
  const spin = fa.includes("fa-spin") || name === "spinner";
  const solid = fa.includes("fa-solid");
  const className = ["inline-block shrink-0 align-[-0.125em]", spin ? "animate-spin" : "", ...own].join(" ");

  const brand = BRANDS[name];
  if (brand) {
    return (
      <svg
        viewBox="0 0 24 24"
        width="1em"
        height="1em"
        fill="currentColor"
        aria-hidden="true"
        className={className}
        style={style}
        {...rest}
      >
        <path d={brand} />
      </svg>
    );
  }

  const Glyph = MAP[name];
  if (!Glyph) {
    if (import.meta.env.DEV && name) console.warn(`[icon] no lucide icon for fa-${name}`);
    return <Circle size="1em" strokeWidth={1.8} aria-hidden className={className} style={style} />;
  }
  return (
    <Glyph
      size="1em"
      strokeWidth={1.8}
      aria-hidden="true"
      fill={solid && FILLABLE.has(name) ? "currentColor" : "none"}
      className={className}
      style={style}
      {...(rest as object)}
    />
  );
}
