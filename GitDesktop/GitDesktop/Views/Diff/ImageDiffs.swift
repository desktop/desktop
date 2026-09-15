import AppKit
import SwiftUI

// MARK: - ImageDiffs
// Image comparison viewer. Port of
// `electron/app/src/ui/diff/image-diffs/*` (2-up / swipe / onion skin /
// difference + aspect-fit sizing). DDS conversion is dropped: macOS renders
// common formats natively and the original had it flag-gated.
// Sizing math lives in `ImageSizing.swift` (pure, unit-tested).

// MARK: - ModifiedImageDiffView

/// Before/after image comparison with switchable presentation.
/// Port of `ModifiedImageDiff`.
public struct ModifiedImageDiffView: View {
    let previous: DiffImage
    let current: DiffImage
    let diffType: ImageDiffType
    var onChangeDiffType: ((ImageDiffType) -> Void)?

    @State private var swipeFraction = 0.5
    @State private var onionOpacity = 0.5

    public init(
        previous: DiffImage,
        current: DiffImage,
        diffType: ImageDiffType,
        onChangeDiffType: ((ImageDiffType) -> Void)? = nil
    ) {
        self.previous = previous
        self.current = current
        self.diffType = diffType
        self.onChangeDiffType = onChangeDiffType
    }

    public var body: some View {
        VStack(spacing: 0) {
            Picker("Image diff mode", selection: Binding(
                get: { diffType },
                set: { onChangeDiffType?($0) })) {
                Text("2-up").tag(ImageDiffType.twoUp)
                Text("Swipe").tag(ImageDiffType.swipe)
                Text("Onion Skin").tag(ImageDiffType.onionSkin)
                Text("Difference").tag(ImageDiffType.difference)
            }
            .pickerStyle(.segmented)
            .padding(8)
            switch diffType {
            case .twoUp:
                TwoUpImageView(previous: previous, current: current)
            case .swipe:
                VStack(spacing: 0) {
                    SwipeImageView(
                        previous: previous, current: current,
                        fraction: swipeFraction)
                    Slider(value: $swipeFraction, in: 0...1)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .help("Swipe position")
                }
            case .onionSkin:
                VStack(spacing: 0) {
                    OnionSkinImageView(
                        previous: previous, current: current,
                        opacity: onionOpacity)
                    Slider(value: $onionOpacity, in: 0...1)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .help("Onion skin opacity")
                }
            case .difference:
                DifferenceImageView(previous: previous, current: current)
            }
        }
    }
}

// MARK: - Mode views

extension ImageDiffSizing {
    /// Decode a `DiffImage` to `NSImage`.
    public static func nsImage(from diffImage: DiffImage) -> NSImage? {
        guard let data = Data(base64Encoded: diffImage.base64Contents) else { return nil }
        return NSImage(data: data)
    }
}

struct DiffImageView: View {
    let image: DiffImage
    let label: String?

    var body: some View {
        VStack(spacing: 4) {
            if let label {
                Text(label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let nsImage = ImageDiffSizing.nsImage(from: image) {
                Image(nsImage: nsImage)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
            } else {
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color(nsColor: .controlBackgroundColor))
                    .overlay {
                        Text("Unable to display image")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .aspectRatio(1, contentMode: .fit)
            }
        }
    }
}

struct TwoUpImageView: View {
    let previous: DiffImage
    let current: DiffImage

    var body: some View {
        HStack(spacing: 12) {
            DiffImageView(image: previous, label: "Previous")
            DiffImageView(image: current, label: "Current")
        }
        .padding(12)
    }
}

struct SwipeImageView: View {
    let previous: DiffImage
    let current: DiffImage
    let fraction: Double

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                DiffImageView(image: previous, label: nil)
                    .frame(width: geo.size.width, height: geo.size.height)
                DiffImageView(image: current, label: nil)
                    .frame(width: geo.size.width * fraction, alignment: .leading)
                    .clipped()
                    .frame(width: geo.size.width, height: geo.size.height, alignment: .leading)
                Rectangle()
                    .fill(Color.accentColor)
                    .frame(width: 1)
                    .offset(x: geo.size.width * fraction)
            }
        }
        .padding(12)
    }
}

struct OnionSkinImageView: View {
    let previous: DiffImage
    let current: DiffImage
    let opacity: Double

    var body: some View {
        ZStack {
            DiffImageView(image: previous, label: nil)
            DiffImageView(image: current, label: nil)
                .opacity(opacity)
        }
        .padding(12)
    }
}

struct DifferenceImageView: View {
    let previous: DiffImage
    let current: DiffImage

    var body: some View {
        ZStack {
            DiffImageView(image: previous, label: nil)
            DiffImageView(image: current, label: nil)
                .blendMode(.difference)
        }
        .padding(12)
    }
}

// MARK: - Single-sided image diffs

/// New image (no previous). Port of `NewImageDiff`.
public struct NewImageDiffView: View {
    let current: DiffImage

    public init(current: DiffImage) {
        self.current = current
    }

    public var body: some View {
        DiffImageView(image: current, label: "Added")
            .padding(12)
    }
}

/// Deleted image (no current). Port of `DeletedImageDiff`.
public struct DeletedImageDiffView: View {
    let previous: DiffImage

    public init(previous: DiffImage) {
        self.previous = previous
    }

    public var body: some View {
        DiffImageView(image: previous, label: "Deleted")
            .padding(12)
    }
}

#Preview {
    ModifiedImageDiffView(
        previous: DiffImage(base64Contents: DiffFixtures.redPixel, mediaType: "image/png", bytes: 70),
        current: DiffImage(base64Contents: DiffFixtures.bluePixel, mediaType: "image/png", bytes: 70),
        diffType: .twoUp)
    .frame(width: 480, height: 320)
}
