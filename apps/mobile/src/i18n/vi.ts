export const catalog = {
  app: {
    name: 'Không gian họp Kaiser',
    tagline: 'Ghi lại mọi từ.',
  },
  shell: {
    error: {
      title: 'Đã xảy ra lỗi',
      retry: 'Thử lại',
    },
  },
  auth: {
    login: 'Đăng nhập',
    logout: 'Đăng xuất',
    loading: 'Đang tải...',
    error: {
      offline: 'Bạn đang ngoại tuyến. Vui lòng kiểm tra kết nối.',
      expired: 'Phiên làm việc của bạn đã hết hạn. Vui lòng đăng nhập lại.',
      revoked: 'Phiên làm việc của bạn đã bị thu hồi. Vui lòng đăng nhập lại.',
      generic: 'Đã xảy ra lỗi. Vui lòng thử lại.',
    },
  },
  start: {
    title: 'Tiêu đề cuộc họp',
    language: {
      label: 'Ngôn ngữ',
      vi: 'Tiếng Việt',
      en: 'Tiếng Anh',
    },
    mode: {
      label: 'Chế độ họp',
      meeting_only: 'Chỉ ghi âm',
      meeting_translate: 'Dịch',
    },
    source: {
      label: 'Nguồn âm thanh',
      mic: 'Microphone',
      system: 'Âm thanh hệ thống',
    },
    processing: {
      label: 'Phiên âm',
    },
    readiness: {
      label: 'Kiểm tra hệ thống',
    },
    consent: {
      label: 'Đồng ý',
    },
    button: 'Bắt đầu họp',
    back: 'Quay lại',
    next: 'Tiếp theo',
  },
  choice: {
    record_only: 'Chỉ ghi âm',
    live_cloud: 'Hiển thị bản ghi trực tiếp bằng đám mây',
    final_local: 'Tạo bản ghi trên máy tính sau cuộc họp',
    final_cloud: 'Tạo bản ghi bằng đám mây sau cuộc họp',
    final_local_cloud_check: 'Tạo bản ghi cục bộ, sau đó kiểm tra các phần khó bằng đám mây',
  },
  readiness: {
    block: {
      microphone_permission: 'Cần quyền truy cập microphone',
      audio_source_invalid: 'Không có nguồn âm thanh hợp lệ',
      storage_insufficient: 'Không đủ dung lượng lưu trữ',
    },
    delay: {
      waiting_for_desktop: 'Đang chờ kết nối máy tính',
      waiting_for_model: 'Đang chờ mô hình dịch',
      provider_unavailable: 'Nhà cung cấp đám mây không khả dụng',
      offline: 'Bạn đang ngoại tuyến',
      translation_unavailable: 'Dịch không khả dụng',
    },
  },
  consent: {
    copy: 'Đây là bản sao lưu ý đồng ý tạm thời. Bản sao lưu ý thực sẽ được cung cấp trong v0.2.',
    provider: 'Nhà cung cấp',
    scope: 'Phạm vi',
    version: 'Phiên bản',
    grant: 'Đồng ý',
    decline: 'Từ chối',
  },
  test: {
    greeting: 'Xin chào {name}',
  },
};
