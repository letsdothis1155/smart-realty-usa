import ARKit
import RoomPlan
import UIKit

@available(iOS 16.0, *)
final class RoomScannerViewController: UIViewController, RoomCaptureSessionDelegate, RoomCaptureViewDelegate {
    private let captureView = RoomCaptureView(frame: .zero)
    private let statusLabel = UILabel()
    private let actionButton = UIButton(type: .system)
    private let shareButton = UIButton(type: .system)
    private var finalRoom: CapturedRoom?
    private var isScanning = false

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Smart Realty Room Scanner"
        view.backgroundColor = .systemBackground
        configureCaptureView()
        configureControls()
        updateAvailability()
    }

    private func configureCaptureView() {
        captureView.translatesAutoresizingMaskIntoConstraints = false
        captureView.captureSession.delegate = self
        captureView.delegate = self
        view.addSubview(captureView)
        NSLayoutConstraint.activate([
            captureView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            captureView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            captureView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            captureView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    private func configureControls() {
        let panel = UIVisualEffectView(effect: UIBlurEffect(style: .systemMaterialDark))
        panel.translatesAutoresizingMaskIntoConstraints = false
        panel.layer.cornerRadius = 18
        panel.clipsToBounds = true

        statusLabel.text = "Move slowly and capture every wall, doorway, and window."
        statusLabel.textColor = .white
        statusLabel.font = .preferredFont(forTextStyle: .footnote)
        statusLabel.numberOfLines = 0

        actionButton.configuration = .filled()
        actionButton.configuration?.title = "Start room scan"
        actionButton.configuration?.buttonSize = .large
        actionButton.addTarget(self, action: #selector(toggleScan), for: .touchUpInside)

        shareButton.configuration = .borderedProminent()
        shareButton.configuration?.title = "Share JSON to builder"
        shareButton.configuration?.buttonSize = .large
        shareButton.isHidden = true
        shareButton.addTarget(self, action: #selector(shareJSON), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [statusLabel, actionButton, shareButton])
        stack.axis = .vertical
        stack.spacing = 10
        stack.translatesAutoresizingMaskIntoConstraints = false
        panel.contentView.addSubview(stack)
        view.addSubview(panel)
        NSLayoutConstraint.activate([
            panel.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            panel.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
            panel.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16),
            stack.leadingAnchor.constraint(equalTo: panel.contentView.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: panel.contentView.trailingAnchor, constant: -16),
            stack.topAnchor.constraint(equalTo: panel.contentView.topAnchor, constant: 14),
            stack.bottomAnchor.constraint(equalTo: panel.contentView.bottomAnchor, constant: -14)
        ])
    }

    private func updateAvailability() {
        guard ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) else {
            actionButton.isEnabled = false
            statusLabel.text = "Room scanning requires a LiDAR-equipped iPhone or iPad."
            return
        }
        guard RoomCaptureSession.isSupported else {
            actionButton.isEnabled = false
            statusLabel.text = "RoomPlan is unavailable on this device."
            return
        }
    }

    @objc private func toggleScan() {
        if isScanning {
            statusLabel.text = "Processing measured room geometry…"
            actionButton.isEnabled = false
            captureView.captureSession.stop()
        } else {
            finalRoom = nil
            shareButton.isHidden = true
            captureView.captureSession.run(configuration: RoomCaptureSession.Configuration())
            isScanning = true
            actionButton.configuration?.title = "Finish scan"
            statusLabel.text = "Scanning locally. Walk slowly and point at every room boundary."
        }
    }

    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
        error == nil
    }

    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        isScanning = false
        actionButton.isEnabled = true
        actionButton.configuration?.title = "Scan again"
        if let error {
            statusLabel.text = "The room could not be processed: \(error.localizedDescription)"
            return
        }
        finalRoom = processedResult
        shareButton.isHidden = false
        statusLabel.text = "Measured room ready. Share the JSON, then import it in the Smart Realty 3D builder."
    }

    func captureSession(_ session: RoomCaptureSession, didEndWith data: CapturedRoomData, error: Error?) {
        if let error {
            isScanning = false
            actionButton.isEnabled = true
            actionButton.configuration?.title = "Scan again"
            statusLabel.text = "Scanning ended: \(error.localizedDescription)"
        }
    }

    @objc private func shareJSON() {
        guard let finalRoom else { return }
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let data = try encoder.encode(finalRoom)
            let safeDate = ISO8601DateFormatter().string(from: Date()).replacingOccurrences(of: ":", with: "-")
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("smart-realty-room-\(safeDate).json")
            try data.write(to: url, options: .atomic)
            let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = shareButton
            present(sheet, animated: true)
        } catch {
            statusLabel.text = "JSON export failed: \(error.localizedDescription)"
        }
    }
}
