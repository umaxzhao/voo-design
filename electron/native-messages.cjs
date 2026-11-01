const messages = {
  en: { title: "Unsaved changes", message: "Close without saving your changes?",
    detail: "Your current unsaved edits will be discarded.", keep: "Keep editing", discard: "Discard and close" },
  zh: { title: "未保存的更改", message: "放弃未保存的更改并关闭？",
    detail: "当前尚未保存的编辑内容将被丢弃。", keep: "继续编辑", discard: "放弃并关闭" },
};
exports.closeMessages = locale => messages[String(locale).startsWith("zh") ? "zh" : "en"];
