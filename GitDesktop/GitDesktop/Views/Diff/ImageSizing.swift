import CoreGraphics
import Foundation

// MARK: - ImageSizing
// Pure image-fit math for the image diff viewer. Port of
// `electron/app/src/ui/diff/image-diffs/sizing.ts`. Framework-free so the
// headless test harness can compile it (`ImageDiffs.swift` holds the
// AppKit-backed views).

public enum ImageDiffSizing {
    /// Fit `imageSize` inside `containerSize` without upscaling,
    /// preserving aspect ratio. Port of `getAspectFitSize`.
    public static func aspectFit(imageSize: CGSize, containerSize: CGSize) -> CGSize {
        guard imageSize.width > 0, imageSize.height > 0,
              containerSize.width > 0, containerSize.height > 0
        else { return .zero }
        let heightRatio = containerSize.height < imageSize.height
            ? imageSize.height / containerSize.height : 1
        let widthRatio = containerSize.width < imageSize.width
            ? imageSize.width / containerSize.width : 1
        var ratio = max(1, widthRatio)
        if widthRatio < heightRatio {
            ratio = max(1, heightRatio)
        }
        return CGSize(width: imageSize.width / ratio, height: imageSize.height / ratio)
    }

    /// Shared size fitting the bigger of two images. Port of `getMaxFitSize`.
    public static func maxFit(previous: CGSize, current: CGSize, container: CGSize) -> CGSize {
        let a = aspectFit(imageSize: previous, containerSize: container)
        let b = aspectFit(imageSize: current, containerSize: container)
        return CGSize(width: max(a.width, b.width), height: max(a.height, b.height))
    }
}
