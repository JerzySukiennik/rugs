import glob
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = "/Users/jurek/Downloads/Claude/Projects/Rug Rush"
TEX_GLOB = os.path.join(ROOT, "assets", "textures", "*", "color.jpg")
OUT = os.path.join(ROOT, "Niepotrzebne", "contact-textures.png")

TILE = 256
LABEL_H = 44
PAD = 16
COLS = 5
BG = (238, 238, 238)
INK = (20, 20, 20)
SUB = (90, 90, 90)


def load_font(size):
    for path in ("/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf"):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main():
    paths = sorted(glob.glob(TEX_GLOB))
    rows = (len(paths) + COLS - 1) // COLS
    width = PAD + COLS * (TILE + PAD)
    height = PAD + rows * (TILE + LABEL_H + PAD)
    sheet = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(sheet)
    name_font = load_font(18)
    sub_font = load_font(13)

    for i, path in enumerate(paths):
        r, c = divmod(i, COLS)
        x = PAD + c * (TILE + PAD)
        y = PAD + r * (TILE + LABEL_H + PAD)
        tile = Image.open(path).convert("RGB")
        opacity_path = os.path.join(os.path.dirname(path), "opacity.jpg")
        note = "color.jpg"
        if os.path.exists(opacity_path):
            alpha = Image.open(opacity_path).convert("L")
            backdrop = Image.new("RGB", tile.size, (225, 225, 225))
            tile = Image.composite(tile, backdrop, alpha)
            note = "color + opacity, on light"
        tile = tile.resize((TILE, TILE), Image.LANCZOS)
        sheet.paste(tile, (x, y))
        draw.rectangle([x, y, x + TILE - 1, y + TILE - 1], outline=(60, 60, 60))
        short = os.path.basename(os.path.dirname(path))
        draw.text((x, y + TILE + 6), short, fill=INK, font=name_font)
        draw.text((x, y + TILE + 26), note, fill=SUB, font=sub_font)

    sheet.save(OUT)
    print(OUT, sheet.size, len(paths), "textures")


if __name__ == "__main__":
    main()
