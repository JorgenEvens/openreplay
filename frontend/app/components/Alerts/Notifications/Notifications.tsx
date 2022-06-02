import React, { useEffect } from 'react';
import stl from './notifications.module.css';
import ListItem from './ListItem';
import { connect } from 'react-redux';
import { Button, SlideModal, Icon, Popup, NoContent } from 'UI';
import { fetchList, setViewed, clearAll } from 'Duck/notifications';
import { setLastRead } from 'Duck/announcements';
import cn from 'classnames';
import AnimatedSVG, { ICONS } from 'Shared/AnimatedSVG/AnimatedSVG';
import { useModal } from 'App/components/Modal';
import AlertTriggersModal from 'Shared/AlertTriggersModal';

const AUTOREFRESH_INTERVAL = 5 * 60 * 1000;

// @withToggle('visible', 'toggleVisisble')
// @withRouter
// class Notifications extends React.Component {
//   state = { alertType: '' };

//   constructor(props) {
//     super(props);
//     // setTimeout(() => {
//     //   props.fetchList();
//     // }, 1000);
    
//     setInterval(() => {
//       props.fetchList();
//     }, AUTOREFRESH_INTERVAL);
//   }

//   writeOption = (e, { name, value }) => this.setState({ [ name ]: value });

//   navigateToUrl = notification => { // TODO should be able to open the alert edit form
//     if (notification.options.source === 'ALERT') {
//       const { initAlert } = this.props;
//       this.props.fetchAlerts().then(function() {
//         const { alerts } = this.props;
//         const alert = alerts.find(i => i.alertId === notification.options.sourceId)
//         initAlert(alert.toJS());
//       }.bind(this));
//     }    
//   }

//   onClearAll = () => {
//     const { notifications } = this.props;
//     const firstItem = notifications.first();
//     this.props.clearAll({ endTimestamp: firstItem.createdAt.ts });
//   }

//   onClear = notification => {
//     this.props.setViewed(notification.notificationId)
//   }

//   toggleModal = () => {    
//     this.props.toggleVisisble(!this.props.visible);
//   }

//   render() {
//     const { notifications, visible, loading, clearing, clearingAll } = this.props;
//     const { alertType } = this.state;
//     const unReadNotificationsCount = notifications.filter(({viewed}) => !viewed).size

//     const filteredList = alertType === '' ?
//       notifications :
//       notifications.filter(i => i.filterKey === alertType);    

//     return (
//       <div>       
//         <Popup
//           content={ `Alerts` }
//         >
//            <div className={ stl.button } onClick={ this.toggleModal } data-active={ visible }>
//             <div className={ stl.counter } data-hidden={ unReadNotificationsCount === 0 }>
//               { unReadNotificationsCount }
//             </div>
//             <Icon name="bell" size="18" />
//           </div>
//         </Popup>
//         <SlideModal
//           title={
//             <div className="flex items-center justify-between">
//               <div>Alerts</div>
//               { unReadNotificationsCount > 0 && (
//                 <div className="">
//                   <Button
//                     loading={clearingAll}
//                     variant="text"
//                     onClick={this.props.setLastRead}
//                     disabled={unReadNotificationsCount === 0}
//                   >
//                     <span
//                       className={ cn("text-sm color-gray-medium", { 'invisible' : clearingAll })}
//                       onClick={this.onClearAll}>
//                         IGNORE ALL
//                     </span>
//                   </Button>
//                 </div>
//               )}
//             </div>
//           }
//           right
//           isDisplayed={ visible }
//           onClose={ visible && this.toggleModal }
//           bgColor="white"
//           size="small"
//           content={ 
//             <div className="">
//               <NoContent
//                 title={
//                   <div className="flex items-center justify-between">
//                     <AnimatedSVG name={ICONS.EMPTY_STATE} size="100" />
//                   </div>
//                 }
//                 subtext="There are no alerts to show."
//                 show={ !loading && notifications.size === 0 }
//                 size="small"
//               >
//                 {
//                   filteredList.map(item => (
//                     <div className="border-b" key={item.key}>
//                       <ListItem
//                         key={item.key}
//                         alert={item}
//                         onClear={() => this.onClear(item)}
//                         loading={clearing}                        
//                       />
//                     </div>
//                   ))
//                 }
//               </NoContent>
//             </div>
//           }
//         />
//       </div>
//     );
//   }
// }

// export default connect(state => ({
//   notifications: state.getIn(['notifications', 'list']),
//   loading: state.getIn(['notifications', 'fetchRequest', 'loading']),
//   clearing: state.getIn(['notifications', 'setViewed', 'loading']),
//   clearingAll: state.getIn(['notifications', 'clearAll', 'loading']),
//   alerts: state.getIn(['alerts', 'list']),
// }), { fetchList, setLastRead, setViewed, clearAll, fetchAlerts, initAlert })(Notifications);

interface Props {
  notifications: any;
  fetchList: any;
}
function Notifications(props: Props) {
  const { notifications } = props;
  const { showModal } = useModal();
  const unReadNotificationsCount = notifications.filter(({viewed}: any) => !viewed).size

  useEffect(() => {
    if (notifications.size === 0) {
      props.fetchList();
    }

    const interval = setInterval(() => {
      props.fetchList();
    }, AUTOREFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  return (
      <Popup
          content={ `Alerts` }
      >
        <div className={ stl.button } onClick={ () => showModal(<AlertTriggersModal unReadNotificationsCount={unReadNotificationsCount} />, { right: true }) }>
          <div className={ stl.counter } data-hidden={ unReadNotificationsCount === 0 }>
            { unReadNotificationsCount }
          </div>
          <Icon name="bell" size="18" />
        </div>
    </Popup>
  );
}

export default connect((state: any) => ({
  notifications: state.getIn(['notifications', 'list']),
}), { fetchList, setLastRead, setViewed, clearAll })(Notifications);