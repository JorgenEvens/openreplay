package messages

import (
	"fmt"
	"github.com/pkg/errors"
	"io"
	"strings"
)

func ReadBatchReader(reader io.Reader, messageHandler func(Message)) error {
	var index uint64
	var timestamp int64

	for {
		msg, err := ReadMessage(reader)
		if err == io.EOF {
			return nil
		} else if err != nil {
			if strings.HasPrefix(err.Error(), "Unknown message code:") {
				code := strings.TrimPrefix(err.Error(), "Unknown message code: ")
				msg, err = DecodeExtraMessage(code, reader)
				if err != nil {
					return fmt.Errorf("can't decode msg: %s", err)
				}
			} else {
				return errors.Wrapf(err, "Batch Message decoding error on message with index %v", index)
			}
		}
		msg = transformDeprecated(msg)

		isBatchMeta := false
		switch m := msg.(type) {
		case *BatchMeta: // Is not required to be present in batch since IOS doesn't have it (though we might change it)
			if index != 0 { // Might be several 0-0 BatchMeta in a row without a error though
				return errors.New("Batch Meta found at the end of the batch")
			}
			index = m.PageNo<<32 + m.FirstIndex // 2^32  is the maximum count of messages per page (ha-ha)
			timestamp = m.Timestamp
			isBatchMeta = true
			// continue readLoop
		case *IOSBatchMeta:
			if index != 0 { // Might be several 0-0 BatchMeta in a row without a error though
				return errors.New("Batch Meta found at the end of the batch")
			}
			index = m.FirstIndex
			timestamp = int64(m.Timestamp)
			isBatchMeta = true
			// continue readLoop
		case *Timestamp:
			timestamp = int64(m.Timestamp) // TODO(?): replace timestamp type to int64 everywhere (including encoding part in tracker)
			// No skipping here for making it easy to encode back the same sequence of message
			// continue readLoop
		case *SessionStart:
			timestamp = int64(m.Timestamp)
		case *SessionEnd:
			timestamp = int64(m.Timestamp)
		}
		msg.Meta().Index = index
		msg.Meta().Timestamp = timestamp

		messageHandler(msg)
		if !isBatchMeta { // Without that indexes will be unique anyway, though shifted by 1 because BatchMeta is not counted in tracker
			index++
		}
	}
	return errors.New("Error of the codeflow. (Should return on EOF)")
}
